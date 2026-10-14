import { terminatorTargets, type FunctionIR, type Operation } from "./model.js";
import { analyzeLiveness, isLive, liveFloor } from "./liveness.js";

/**
 * Removes checkInitialized operations whose slot is definitely initialized
 * (a forward must-analysis over the control-flow graph). Lowering checks
 * every read of a let/const binding for the temporal dead zone; in a loop
 * that is a compare and branch per read although the binding was
 * initialized before the loop.
 *
 * A slot is initialized after an operation that cannot produce the
 * uninitialized marker (constants, arithmetic, calls, object creation, …),
 * after a copy from an initialized slot, and after checkInitialized itself
 * (which throws otherwise). A global binding read is initialized after this
 * function initialized the binding; reads of cells and captures may observe
 * the marker and initialize nothing. An exception handler starts
 * with what holds at every point of the blocks it protects.
 *
 * A block's entry state keeps only slots live there and globals this
 * function reads: everything else can no longer be checked, and keeping it
 * made the analysis of a large function cost blocks × slots.
 *
 * Cells of let/const/class bindings are tracked too (#242), as cell(slot):
 * a cell is initialized after newCell or writeCell of an initialized value,
 * and a readCell of an initialized cell is initialized. A closure's capture
 * is initialized when every newFunction that creates the closure runs where
 * the captured cell is initialized (initializedCaptures): the closure can
 * only run after it is created, so its reads of that capture need no check.
 * A hoisted function declaration is created before the binding it reads is
 * initialized and keeps its checks.
 */
const producesValue = new Set<Operation["kind"]>([
    "constant",
    "binary",
    "unary",
    "newFunction",
    "realmFunction",
    "newObject",
    "newArguments",
    "newRestArray",
    "invoke",
    "invokeArray",
    "constructForward",
    "property",
    "newInstance",
    "constructorResult",
    "forInKeys",
    "forInHas",
    "forOfValue",
    "globalObject",
    "currentFunction",
    "newCell",
    "superGet",
    "newTarget",
    "iteratorStep",
    "call",
]);

type State = Set<number> | null; // null: every slot (not yet reached)

function intersect(a: State, b: ReadonlySet<number>): Set<number> {
    if (a === null) return new Set(b);
    for (const slot of a) if (!b.has(slot)) a.delete(slot);
    return a;
}

// Global bindings are tracked as -1-index: once initialized, a binding never
// returns to its dead zone, so a later read in this function is initialized.
const global = (index: number) => -1 - index;
// A cell slot's "the cell holds an initialized value" fact: above every slot.
const cellBase = 2 ** 40;
const cell = (slot: number) => cellBase + slot;
function step(
    operation: Operation,
    state: Set<number>,
    readGlobals: ReadonlySet<number>,
    captures: ReadonlySet<number>,
): void {
    if ("dest" in operation) state.delete(cell(operation.dest));
    switch (operation.kind) {
        case "newCell":
            if (state.has(operation.source)) state.add(cell(operation.dest));
            break;
        case "writeCell":
            if (state.has(operation.source)) state.add(cell(operation.cell));
            else state.delete(cell(operation.cell));
            return;
        case "loadCapture":
            if (captures.has(operation.index)) state.add(cell(operation.dest));
            break;
        case "readCell":
            if (state.has(cell(operation.cell))) {
                state.add(operation.dest);
                return;
            }
            break;
        case "copy":
            if (state.has(cell(operation.source)))
                state.add(cell(operation.dest));
            break;
    }
    if (operation.kind === "checkInitialized") {
        state.add(operation.slot);
        return;
    }
    if (operation.kind === "storeGlobal" && !operation.prelude) {
        if (!readGlobals.has(operation.index)) return;
        if (state.has(operation.source)) state.add(global(operation.index));
        else state.delete(global(operation.index));
        return;
    }
    if (operation.kind === "loadGlobal" && !operation.prelude) {
        if (state.has(global(operation.index))) state.add(operation.dest);
        else state.delete(operation.dest);
        return;
    }
    if (operation.kind === "copy") {
        if (state.has(operation.source)) state.add(operation.dest);
        else state.delete(operation.dest);
        return;
    }
    if (operation.kind === "getIterator") {
        state.add(operation.iterator);
        state.add(operation.next);
        return;
    }
    if (operation.kind === "iteratorStep") state.add(operation.done);
    if (operation.kind === "yieldDelegated") state.delete(operation.mode);
    if ("dest" in operation) {
        if (producesValue.has(operation.kind)) state.add(operation.dest);
        else state.delete(operation.dest);
    }
}

export function removeRedundantInitializationChecks(
    fn: FunctionIR,
    captures: ReadonlySet<number> = new Set(),
): FunctionIR {
    if (
        !fn.blocks.some((block) =>
            block.operations.some((op) => op.kind === "checkInitialized"),
        )
    )
        return fn;
    const entry = analyze(fn, captures);
    return {
        ...fn,
        blocks: fn.blocks.map((block, i) => {
            const start = entry.states[i];
            if (start === null) return block;
            const state = new Set(start),
                operations: Operation[] = [];
            for (const operation of block.operations) {
                if (
                    operation.kind === "checkInitialized" &&
                    state.has(operation.slot)
                )
                    continue;
                operations.push(operation);
                step(operation, state, entry.readGlobals, captures);
            }
            return operations.length === block.operations.length
                ? block
                : { ...block, operations };
        }),
    };
}

/**
 * For every function, the indexes of its captures that are initialized
 * whenever it runs: those whose cell is initialized at every newFunction
 * that creates it. Captures pass from a closure to the closures it creates
 * (through loadCapture), so the facts are iterated to a fixed point; they
 * only grow, starting from none.
 */
export function initializedCaptures(
    functions: readonly FunctionIR[],
): Map<string, Set<number>> {
    const known = new Map<string, Set<number>>();
    for (let round = 0; round < 32; round++) {
        const sites = new Map<string, Set<number> | null>();
        const record = (target: string, facts: Set<number> | null) => {
            const before = sites.get(target);
            if (before === null || facts === null) {
                sites.set(target, null);
                return;
            }
            if (before === undefined) {
                sites.set(target, facts);
                return;
            }
            for (const index of before)
                if (!facts.has(index)) before.delete(index);
        };
        for (const fn of functions) {
            const creates = fn.blocks.some((block) =>
                block.operations.some(
                    (op) =>
                        (op.kind === "newFunction" && op.captures?.length) ||
                        op.kind === "realmFunction",
                ),
            );
            if (!creates) continue;
            const captures = known.get(fn.id) ?? new Set<number>(),
                entry = analyze(fn, captures);
            fn.blocks.forEach((block, i) => {
                const start = entry.states[i];
                if (start === null) return;
                const state = new Set(start);
                for (const op of block.operations) {
                    if (op.kind === "realmFunction") record(op.target, null);
                    else if (op.kind === "newFunction") {
                        const facts = new Set<number>();
                        (op.captures ?? []).forEach((slot, index) => {
                            if (state.has(cell(slot))) facts.add(index);
                        });
                        record(op.target, facts);
                    }
                    step(op, state, entry.readGlobals, captures);
                }
            });
        }
        let changed = false;
        for (const [target, facts] of sites) {
            if (facts === null || !facts.size) continue;
            const before = known.get(target);
            if (!before || before.size !== facts.size) {
                known.set(target, facts);
                changed = true;
            }
        }
        if (!changed) break;
    }
    return known;
}

/** The entry state of every block (null: not reached) and the globals the function reads. */
function analyze(
    fn: FunctionIR,
    captures: ReadonlySet<number>,
): { states: State[]; readGlobals: Set<number> } {
    const index = new Map(fn.blocks.map((block, i) => [block.id, i]));
    const readGlobals = new Set<number>();
    for (const block of fn.blocks)
        for (const op of block.operations)
            if (op.kind === "loadGlobal" && !op.prelude)
                readGlobals.add(op.index);
    const liveness = analyzeLiveness(fn),
        floor = liveFloor(fn);
    const liveAt = (j: number, state: ReadonlySet<number>): Set<number> => {
        const liveIn = liveness.get(fn.blocks[j]!.id)!.liveIn,
            kept = new Set<number>();
        for (const slot of state)
            if (
                slot < 0 ||
                isLive(liveIn, slot >= cellBase ? slot - cellBase : slot, floor)
            )
                kept.add(slot);
        return kept;
    };
    const entry: State[] = fn.blocks.map((_, i) =>
        i === 0 ? new Set<number>() : null,
    );
    const successors = (i: number): number[] => {
        return terminatorTargets(fn.blocks[i]!.terminator);
    };
    // Iterate to a fixed point; states only shrink.
    let changed = true;
    while (changed) {
        changed = false;
        fn.blocks.forEach((block, i) => {
            const start = entry[i];
            if (start === null) return;
            const state = new Set(start);
            let everywhere = new Set(start);
            for (const operation of block.operations) {
                step(operation, state, readGlobals, captures);
                everywhere = intersect(everywhere, state);
            }
            const flow = (target: number, out: ReadonlySet<number>) => {
                const j = index.get(target);
                if (j === undefined) return;
                const before = entry[j] === null ? -1 : entry[j]!.size,
                    next = intersect(
                        entry[j] === null ? null : new Set(entry[j]!),
                        liveAt(j, out),
                    );
                if (entry[j] === null || next.size !== before) {
                    entry[j] = next;
                    changed = true;
                }
            };
            for (const target of successors(i)) flow(target, state);
            if (block.exceptionTarget !== undefined)
                flow(block.exceptionTarget, everywhere);
        });
    }
    return { states: entry, readGlobals };
}
