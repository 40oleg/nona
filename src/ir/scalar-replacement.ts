import {
    terminatorTargets,
    terminatorUse,
    type Constant,
    type FunctionIR,
    type Operation,
} from "./model.js";
import { definitions } from "./copies.js";
import { operationUses } from "./liveness.js";

/**
 * Scalar replacement of object and array literals that never escape the
 * function (#236, #146 items 7 and 8). `const r = {width, height}; return
 * r.width * r.height` allocates an object nobody else can observe; its
 * properties become slots, the initial definitions copies into them and the
 * reads copies out of them, and the allocation goes away.
 *
 * A candidate is an object literal with static keys (#194) or an array
 * literal with its element table (#48). The slots that may hold it are its
 * destination and the slots copied from them; every definition of these
 * slots must be the literal, such a copy, or a dead-zone marker. They may
 * only be read by the literal's own definitions (`setProperty` with
 * literalSlot/literalElement), by `get`s of a constant key that is an own
 * data property (a key of the literal; an index below the array's length or
 * `length`), by copies between them and by dead-zone checks. Any other use
 * (a call, a return, a capture, a comparison, a store, for-in, a key that
 * is missing and would read the prototype chain, ...) disqualifies it.
 *
 * Slots are not SSA and a literal in a loop creates a new object each time,
 * so a forward analysis proves that every such read and definition sees the
 * most recent object of the literal (not an older one kept in another slot,
 * not a parameter or the initial undefined of a slot). Each property gets a
 * fresh slot, set to undefined where the object was created. Copies between
 * the object's slots become `undefined` constants (dead-zone markers and
 * checks keep working) that later passes drop. Initializers run as before.
 *
 * Functions with a mapped `arguments` object are left alone. Captured
 * bindings, `with` and direct eval reach locals through cells and calls,
 * which are uses that disqualify the literal.
 */

/** The slot holds the literal's most recent object. */
const current = 1;
/** Anything else: an older object of the literal, undefined, a parameter. */
const other = 2;
/** The dead-zone marker. */
const uninit = 4;
/** Array literals with more elements keep their allocation. */
const maxElements = 32;

type NewObject = Extract<Operation, { kind: "newObject" }>;
interface Site {
    block: number;
    index: number;
    op: Operation;
}
interface Candidate {
    op: NewObject;
    tracked: Set<number>;
    /** Slots of the properties (keys or elements), filled when replaced. */
    fields: number[];
}
/** Where each slot is defined and read, built once per function. */
interface Index {
    definitions: Map<number, Site[]>;
    uses: Map<number, Site[]>;
    /** Slots read by a terminator or written by a handler. */
    pinned: Set<number>;
}

function push(map: Map<number, Site[]>, slot: number, site: Site): void {
    const list = map.get(slot);
    if (list) list.push(site);
    else map.set(slot, [site]);
}

/** The own data property a constant key names, or undefined. */
function field(op: NewObject, key: Constant): number | "length" | undefined {
    if (op.array) {
        if (key === "length") return "length";
        return typeof key === "number" &&
            Number.isInteger(key) &&
            key >= 0 &&
            key < op.length
            ? key
            : undefined;
    }
    const index = op.keys!.indexOf(String(key));
    return index >= 0 ? index : undefined;
}

/** The key of a get: its literal name, or a constant defined earlier in its block. */
function constantKey(
    fn: FunctionIR,
    site: Site,
): { key: Constant } | undefined {
    const op = site.op as Extract<Operation, { kind: "property" }>;
    if (op.keyName !== undefined) return { key: op.keyName };
    const operations = fn.blocks[site.block]!.operations;
    for (let i = site.index - 1; i >= 0; i--) {
        const earlier = operations[i]!;
        if (definitions(earlier).includes(op.key))
            return earlier.kind === "constant"
                ? { key: earlier.value }
                : undefined;
    }
    return undefined;
}

export function replaceScalars(fn: FunctionIR): FunctionIR {
    const candidates: Candidate[] = [],
        index: Index = {
            definitions: new Map(),
            uses: new Map(),
            pinned: new Set(),
        };
    for (const [b, block] of fn.blocks.entries()) {
        for (const [i, op] of block.operations.entries()) {
            if (op.kind === "newArguments") return fn;
            const site = { block: b, index: i, op };
            for (const d of definitions(op)) push(index.definitions, d, site);
            for (const u of operationUses(op)) push(index.uses, u, site);
            if (op.kind === "pushHandler") index.pinned.add(op.error);
            if (
                op.kind === "newObject" &&
                ((op.keys && !op.array) ||
                    (op.array && op.elements && op.length <= maxElements))
            )
                candidates.push({ op, tracked: new Set(), fields: [] });
        }
        index.pinned.add(terminatorUse(block.terminator));
    }
    const replaced = candidates.filter((c) => qualifies(fn, index, c));
    return replaced.length ? rewrite(fn, replaced) : fn;
}

function qualifies(fn: FunctionIR, index: Index, c: Candidate): boolean {
    const { tracked, op: literal } = c;
    // The slots that may hold the object: closed under copies.
    const work = [literal.dest];
    while (work.length) {
        const slot = work.pop()!;
        if (tracked.has(slot)) continue;
        if (index.pinned.has(slot)) return false;
        tracked.add(slot);
        for (const { op } of index.uses.get(slot) ?? [])
            if (op.kind === "copy" && op.source === slot) work.push(op.dest);
    }
    // Every definition and use of them is one the rewrite understands.
    for (const slot of tracked) {
        for (const { op } of index.definitions.get(slot)!)
            if (
                op !== literal &&
                !(op.kind === "copy" && tracked.has(op.source)) &&
                op.kind !== "uninitialized"
            )
                return false;
        for (const site of index.uses.get(slot) ?? [])
            if (!allowedUse(fn, site, c)) return false;
    }
    return everyReadSeesCurrent(fn, index, c);
}

function allowedUse(fn: FunctionIR, site: Site, c: Candidate): boolean {
    const { tracked, op: literal } = c,
        op = site.op;
    switch (op.kind) {
        case "copy":
        case "checkInitialized":
            return true;
        case "setProperty":
            return (
                tracked.has(op.object) &&
                !tracked.has(op.key) &&
                !tracked.has(op.source) &&
                (literal.array
                    ? op.literalElement !== undefined &&
                      op.literalElement < literal.length
                    : op.literalSlot !== undefined &&
                      op.literalSlot < literal.keys!.length)
            );
        case "property": {
            if (op.operation !== "get" || tracked.has(op.key)) return false;
            const key = constantKey(fn, site);
            return key !== undefined && field(literal, key.key) !== undefined;
        }
        default:
            return false;
    }
}

/**
 * Forward analysis of what the tracked slots hold (bit sets of current,
 * other and uninit): the literal's own definitions and every get must see
 * exactly the current object. Only the operations on tracked slots change
 * the state; the others are skipped.
 */
function everyReadSeesCurrent(
    fn: FunctionIR,
    index: Index,
    c: Candidate,
): boolean {
    const slots = [...c.tracked],
        position = new Map(slots.map((s, i) => [s, i])),
        at = (slot: number) => position.get(slot)!,
        relevant = new Map<number, Site[]>(),
        blockIndex = new Map(fn.blocks.map((block, i) => [block.id, i])),
        entry = new Map<number, number[]>();
    for (const slot of slots)
        for (const map of [index.definitions, index.uses])
            for (const site of map.get(slot) ?? [])
                push(relevant, site.block, site);
    for (const [b, sites] of relevant)
        relevant.set(
            b,
            [...new Set(sites)].sort((x, y) => x.index - y.index),
        );
    const merge = (id: number, state: readonly number[]): boolean => {
        const old = entry.get(id);
        if (!old) {
            entry.set(id, [...state]);
            return true;
        }
        let changed = false;
        state.forEach((bits, i) => {
            if ((old[i]! | bits) !== old[i]) {
                old[i] = old[i]! | bits;
                changed = true;
            }
        });
        return changed;
    };
    const step = (state: number[], op: Operation): boolean => {
        switch (op.kind) {
            case "newObject":
                // Slots holding the previous object now hold an older one.
                for (let i = 0; i < state.length; i++)
                    if (state[i]! & current)
                        state[i] = (state[i]! & ~current) | other;
                state[at(op.dest)] = current;
                return true;
            case "copy":
                state[at(op.dest)] = state[at(op.source)]!;
                return true;
            case "uninitialized":
                state[at(op.dest)] = uninit;
                return true;
            case "checkInitialized":
                state[at(op.slot)] = state[at(op.slot)]! & ~uninit;
                return true;
            case "setProperty":
            case "property":
                return state[at(op.object)] === current;
            default:
                return false;
        }
    };
    const first = fn.blocks[0]!;
    entry.set(
        first.id,
        slots.map(() => other),
    );
    const work = [first.id];
    while (work.length) {
        const b = blockIndex.get(work.pop()!)!,
            block = fn.blocks[b]!,
            state = [...entry.get(block.id)!],
            handler = block.exceptionTarget;
        for (const { op } of relevant.get(b) ?? []) {
            if (handler !== undefined && merge(handler, state))
                work.push(handler);
            if (!step(state, op)) return false;
        }
        if (handler !== undefined && merge(handler, state)) work.push(handler);
        for (const target of terminatorTargets(block.terminator))
            if (merge(target, state)) work.push(target);
    }
    return true;
}

function rewrite(fn: FunctionIR, replaced: Candidate[]): FunctionIR {
    let slotCount = fn.slotCount;
    const bySlot = new Map<number, Candidate>();
    for (const c of replaced) {
        const count = c.op.array ? c.op.length : c.op.keys!.length;
        for (let i = 0; i < count; i++) c.fields.push(slotCount++);
        for (const s of c.tracked) bySlot.set(s, c);
    }
    const blocks = fn.blocks.map((block, b) => {
        let changed = false;
        const operations: Operation[] = [];
        block.operations.forEach((op, index) => {
            const out = replace(fn, { block: b, index, op }, bySlot);
            if (out !== op) changed = true;
            operations.push(...(Array.isArray(out) ? out : [out]));
        });
        return changed ? { ...block, operations } : block;
    });
    return { ...fn, slotCount, blocks };
}

function replace(
    fn: FunctionIR,
    site: Site,
    bySlot: ReadonlyMap<number, Candidate>,
): Operation | Operation[] {
    const op = site.op,
        undefinedIn = (dest: number): Operation => ({
            kind: "constant",
            dest,
            value: undefined,
        });
    switch (op.kind) {
        case "newObject": {
            const c = bySlot.get(op.dest);
            if (c?.op !== op) return op;
            // A literal whose values were evaluated before it (#415) defines
            // its properties itself; the others start undefined and their
            // setProperty definitions follow.
            const values = op.literal?.values ?? op.elementValues;
            return [
                undefinedIn(op.dest),
                ...c.fields.map((dest, i): Operation =>
                    values?.[i] !== undefined
                        ? { kind: "copy", dest, source: values[i]! }
                        : undefinedIn(dest),
                ),
            ];
        }
        case "copy":
            return bySlot.has(op.source) ? undefinedIn(op.dest) : op;
        case "setProperty": {
            const c = bySlot.get(op.object);
            if (!c) return op;
            return {
                kind: "copy",
                dest: c.fields[
                    c.op.array ? op.literalElement! : op.literalSlot!
                ]!,
                source: op.source,
            };
        }
        case "property": {
            const c = bySlot.get(op.object);
            if (!c) return op;
            const at = field(c.op, constantKey(fn, site)!.key)!;
            return at === "length"
                ? { kind: "constant", dest: op.dest, value: c.op.length }
                : { kind: "copy", dest: op.dest, source: c.fields[at]! };
        }
        default:
            return op;
    }
}
