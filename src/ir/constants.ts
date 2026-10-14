import {
    terminatorTargets,
    terminatorUse,
    type Constant,
    type FunctionIR,
    type Operation,
    type Terminator,
} from "./model.js";
import { operationUses } from "./liveness.js";
import { definitions } from "./copies.js";

/**
 * Constant folding, constant propagation and constant branch elimination
 * (#146 items 1-3): a forward must-analysis of the slots that hold a known
 * primitive at each point, over the feasible edges of the control-flow graph
 * only (a branch on a known condition flows to one successor).
 *
 * - A unary or binary operation whose operands are all known primitives is
 *   replaced by the constant it produces, computed with the compiler's own
 *   JavaScript operators. Operations on primitives run no user code, so the
 *   replacement is exact; folding is limited to results whose value cannot
 *   depend on the engine: no BigInt (operands or results), `**` only when
 *   the result is an exactly representable integer, Number-to-String only
 *   for integers, and string results of bounded length.
 * - A copy of a known slot becomes a constant (a temporary defined once by a
 *   constant is kept in read-only data by the code generator).
 * - A branch on a known condition becomes a jump; blocks no longer reachable
 *   are removed.
 *
 * A slot written by the runtime outside an operation's destination (the
 * error slot of an exception handler) is never tracked. Functions with an
 * arguments object are left alone: a mapped one aliases parameter slots.
 * An exception handler starts with what holds at every point of the blocks
 * it protects; a block's entry state keeps only slots live there.
 */
type State = Map<number, Constant> | null;
/** Longest string a fold may produce (UTF-16 units). */
const maxString = 4096;

function same(a: Constant, b: Constant): boolean {
    return Object.is(a, b);
}
function intersect(
    a: State,
    b: ReadonlyMap<number, Constant>,
): Map<number, Constant> {
    if (a === null) return new Map(b);
    for (const [slot, value] of a)
        if (!b.has(slot) || !same(b.get(slot)!, value)) a.delete(slot);
    return a;
}
const isBig = (v: Constant) => typeof v === "bigint";
/** ToString of a primitive that every engine writes the same way. */
const plainString = (v: Constant) =>
    typeof v !== "number" || Number.isSafeInteger(v) || !Number.isFinite(v);

function foldUnary(
    operator: string,
    v: Constant,
): { value: Constant } | undefined {
    if (operator.startsWith("typeofIs:"))
        return { value: typeof v === operator.slice(9) };
    if (operator.startsWith("typeofNot:"))
        return { value: typeof v !== operator.slice(10) };
    switch (operator) {
        case "!":
            return { value: !v };
        case "typeof":
            return { value: typeof v };
        case "isNullish":
            return { value: v === null || v === undefined };
    }
    if (isBig(v)) return undefined;
    // Primitive operands: JavaScript's own coercions are the specification's.
    const n = v as Exclude<Constant, bigint>,
        any = n as unknown as number;
    switch (operator) {
        case "+":
        case "numeric":
            return { value: +any };
        case "-":
            return { value: -any };
        case "~":
            return { value: ~any };
        case "increment":
            return typeof n === "number" ? { value: n + 1 } : undefined;
        case "decrement":
            return typeof n === "number" ? { value: n - 1 } : undefined;
        case "string":
            return plainString(n) ? { value: String(n) } : undefined;
    }
    return undefined;
}

function foldBinary(
    operator: string,
    l: Constant,
    r: Constant,
): { value: Constant } | undefined {
    if (isBig(l) || isBig(r)) {
        // Equality never converts a BigInt in a way that could fail.
        if (operator === "===" || operator === "!==")
            return { value: (operator === "===") === (l === r) };
        return undefined;
    }
    const x = l as Exclude<Constant, bigint>,
        y = r as Exclude<Constant, bigint>;
    const a = x as unknown as number,
        b = y as unknown as number;
    switch (operator) {
        case "+": {
            const primitiveString =
                typeof x === "string" || typeof y === "string";
            if (!primitiveString) return { value: a + b };
            if (!plainString(x) || !plainString(y)) return undefined;
            const s = String(x) + String(y);
            return s.length <= maxString ? { value: s } : undefined;
        }
        case "-":
            return { value: a - b };
        case "*":
            return { value: a * b };
        case "/":
            return { value: a / b };
        case "%":
            return { value: a % b };
        case "**": {
            const base = +a,
                exponent = +b,
                value = base ** exponent;
            return Number.isInteger(base) &&
                Number.isInteger(exponent) &&
                exponent >= 0 &&
                Number.isSafeInteger(value)
                ? { value }
                : undefined;
        }
        case "==":
            return { value: a == b };
        case "!=":
            return { value: a != b };
        case "===":
            return { value: a === b };
        case "!==":
            return { value: a !== b };
        case "<":
            return { value: a < b };
        case "<=":
            return { value: a <= b };
        case ">":
            return { value: a > b };
        case ">=":
            return { value: a >= b };
        case "&":
            return { value: a & b };
        case "|":
            return { value: a | b };
        case "^":
            return { value: a ^ b };
        case "<<":
            return { value: a << b };
        case ">>":
            return { value: a >> b };
        case ">>>":
            return { value: a >>> b };
    }
    return undefined;
}

/** The constant an operation produces from the known slots in state, if any. */
function fold(
    op: Operation,
    state: ReadonlyMap<number, Constant>,
): { value: Constant } | undefined {
    if (op.kind === "constant") return { value: op.value };
    if (op.kind === "copy")
        return state.has(op.source)
            ? { value: state.get(op.source)! }
            : undefined;
    if (op.kind === "unary" && state.has(op.argument))
        return foldUnary(op.operator, state.get(op.argument)!);
    if (op.kind === "binary" && state.has(op.left) && state.has(op.right))
        return foldBinary(
            op.operator,
            state.get(op.left)!,
            state.get(op.right)!,
        );
    return undefined;
}

function step(
    op: Operation,
    state: Map<number, Constant>,
    untracked: ReadonlySet<number>,
): { value: Constant } | undefined {
    const known = fold(op, state);
    for (const d of definitions(op)) state.delete(d);
    if (known && "dest" in op && !untracked.has(op.dest))
        state.set(op.dest, known.value);
    return known;
}

const truthy = (v: Constant) => !!v;

/**
 * The slots that may hold a known primitive somewhere (flow-insensitive):
 * constants, and copies and unary/binary operations of such slots. Undefined
 * when nothing could be rewritten (no copy, operation or branch uses one).
 */
function candidates(blocks: FunctionIR["blocks"]): Set<number> | undefined {
    const known = new Set<number>();
    for (let changed = true; changed;) {
        changed = false;
        for (const block of blocks)
            for (const op of block.operations) {
                if (!("dest" in op) || known.has(op.dest)) continue;
                const derived =
                    op.kind === "constant" ||
                    (op.kind === "copy" && known.has(op.source)) ||
                    (op.kind === "unary" && known.has(op.argument)) ||
                    (op.kind === "binary" &&
                        known.has(op.left) &&
                        known.has(op.right));
                if (derived) {
                    known.add(op.dest);
                    changed = true;
                }
            }
    }
    const useful = blocks.some(
        (block) =>
            ((block.terminator.kind === "branch" ||
                block.terminator.kind === "switch") &&
                known.has(terminatorUse(block.terminator))) ||
            block.operations.some(
                (op) =>
                    op.kind !== "constant" &&
                    "dest" in op &&
                    known.has(op.dest),
            ),
    );
    return useful ? known : undefined;
}

/** Slots that some block reads before it writes them. */
function upwardExposed(blocks: FunctionIR["blocks"]): Set<number> {
    const exposed = new Set<number>();
    for (const block of blocks) {
        const written = new Set<number>();
        for (const op of block.operations) {
            for (const slot of operationUses(op))
                if (!written.has(slot)) exposed.add(slot);
            for (const d of definitions(op)) written.add(d);
        }
        const read = terminatorUse(block.terminator);
        if (read >= 0 && !written.has(read)) exposed.add(read);
    }
    return exposed;
}

export function foldConstants(fn: FunctionIR): FunctionIR {
    const blocks = fn.blocks;
    if (
        !blocks.some((block) =>
            block.operations.some((op) => op.kind === "constant"),
        )
    )
        return fn;
    if (
        blocks.some((block) =>
            block.operations.some((op) => op.kind === "newArguments"),
        )
    )
        return fn;
    const known = candidates(blocks);
    if (!known) return fn;
    const untracked = new Set<number>(),
        handlers = new Set<number>();
    for (const block of blocks)
        for (const op of block.operations)
            if (op.kind === "pushHandler") {
                untracked.add(op.error);
                handlers.add(op.target);
            }
    const index = new Map(blocks.map((block, i) => [block.id, i]));
    // Only slots that some block reads before writing them cross block
    // boundaries (a cheap superset of the slots live at any block entry);
    // dropping the others never changes the result and keeps states small.
    const exposed = upwardExposed(blocks);
    const liveAt = (
        _j: number,
        state: ReadonlyMap<number, Constant>,
    ): Map<number, Constant> => {
        const kept = new Map<number, Constant>();
        for (const [slot, value] of state)
            if (exposed.has(slot)) kept.set(slot, value);
        return kept;
    };
    const entry: State[] = blocks.map((_, i) => (i === 0 ? new Map() : null));
    const condition = (t: Terminator, state: ReadonlyMap<number, Constant>) =>
        t.kind === "branch" && state.has(t.condition)
            ? truthy(state.get(t.condition)!)
            : undefined;
    const successors = (
        i: number,
        state: ReadonlyMap<number, Constant>,
    ): number[] => {
        const t = blocks[i]!.terminator;
        if (t.kind !== "branch") return terminatorTargets(t);
        const known = condition(t, state);
        return known === undefined ? [t.yes, t.no] : [known ? t.yes : t.no];
    };
    let changed = true;
    while (changed) {
        changed = false;
        const flow = (target: number, out: ReadonlyMap<number, Constant>) => {
            const j = index.get(target);
            if (j === undefined) return;
            const before = entry[j] === null ? -1 : entry[j]!.size,
                next = intersect(
                    entry[j] === null ? null : new Map(entry[j]!),
                    liveAt(j, out),
                );
            if (entry[j] === null || next.size !== before) {
                entry[j] = next;
                changed = true;
            }
        };
        blocks.forEach((block, i) => {
            const start = entry[i];
            if (start === null) return;
            const state = new Map(start),
                everywhere =
                    block.exceptionTarget !== undefined
                        ? new Map(start)
                        : undefined;
            for (const op of block.operations) {
                step(op, state, untracked);
                if (everywhere) intersect(everywhere, state);
            }
            for (const target of successors(i, state)) flow(target, state);
            if (everywhere) flow(block.exceptionTarget!, everywhere);
        });
        // A handler's target may also be entered from the runtime: nothing is known there.
        for (const target of handlers) flow(target, new Map());
    }
    let rewritten = false;
    const result = blocks.map((block, i) => {
        const start = entry[i];
        if (start === null) return block;
        const state = new Map(start);
        let blockChanged = false;
        const operations = block.operations.map((op) => {
            const known = step(op, state, untracked);
            if (!known || op.kind === "constant" || !("dest" in op)) return op;
            blockChanged = true;
            return {
                kind: "constant",
                dest: op.dest,
                value: known.value,
            } as Operation;
        });
        const t = block.terminator,
            taken = condition(t, state);
        const terminator: Terminator =
            taken === undefined || t.kind !== "branch"
                ? t
                : { kind: "jump", target: taken ? t.yes : t.no };
        if (terminator !== t) blockChanged = true;
        if (!blockChanged) return block;
        rewritten = true;
        return { ...block, operations, terminator };
    });
    if (!rewritten) return fn;
    return { ...fn, blocks: reachable(result) };
}

/** The blocks reachable from the entry (successors, exception targets and handler targets), in their order. */
export function reachable(blocks: FunctionIR["blocks"]): FunctionIR["blocks"] {
    const byId = new Map(blocks.map((block) => [block.id, block])),
        seen = new Set<number>(),
        work = [blocks[0]!.id];
    while (work.length) {
        const id = work.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const block = byId.get(id);
        if (!block) continue;
        work.push(...terminatorTargets(block.terminator));
        if (block.exceptionTarget !== undefined)
            work.push(block.exceptionTarget);
        for (const op of block.operations)
            if (op.kind === "pushHandler") work.push(op.target);
    }
    return seen.size === blocks.length
        ? blocks
        : blocks.filter((block) => seen.has(block.id));
}
