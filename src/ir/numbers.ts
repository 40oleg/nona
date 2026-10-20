import {
    terminatorTargets,
    type BlockIR,
    type FunctionIR,
    type Operation,
} from "./model.js";
import { definitions } from "./copies.js";
import { analyzeLiveness, isLive, liveFloor } from "./liveness.js";

/**
 * Number type inference (roadmap item 15, first step): a forward
 * must-analysis of the slots that hold a Number at each point. An
 * arithmetic, comparison or update operation whose operands are all such
 * slots is marked `numeric`; the code generator then emits it without tag
 * checks and without the generic runtime fallback, and since it cannot reach
 * the runtime, without clearing dead slots before it. An element read or
 * assignment whose key is such a slot is marked `numericKey` (#240).
 *
 * Numbers come from number constants, from + - * / on Numbers, and from the
 * numeric/increment/decrement/negation unary operators on Numbers. BigInt
 * operands never qualify (their arithmetic allocates), and nothing read
 * from a global, a cell, a property or a call is assumed to be a Number.
 *
 * Some operators produce a Number whatever their operands are, or throw:
 * unary `+` and `>>>` always, `- * / % ** & | ^ << >>` and `~` when an
 * operand is a Number (mixing a BigInt with a Number is a TypeError). Their
 * results are Numbers although the operations themselves keep their generic
 * code (#146 item 15). A branch on `typeof x === 'number'` makes x a Number
 * on the edge where the test holds (#146 item 15).
 *
 * A block's entry state keeps only slots live there: a temporary that held a
 * Number stays a Number forever, so without pruning every block of a large
 * function carried every such temporary (time and memory blocks × slots).
 */
const arithmetic = new Set(["+", "-", "*", "/"]);
const relation = new Set(["<", "<=", ">", ">=", "==", "===", "!=", "!=="]);
const numericUnary = new Set(["numeric", "increment", "decrement", "-", "+"]);

/**
 * `object[key]` reads and `object[key] = value` assignments whose key is not
 * a literal name: with a Number key (marked `numericKey`) the code generator
 * may access a typed array element inline (#240).
 */
function elementSite(
    op: Operation,
): op is Extract<Operation, { kind: "property" | "setProperty" }> {
    return (
        (op.kind === "property" &&
            op.operation === "get" &&
            op.keyName === undefined) ||
        (op.kind === "setProperty" &&
            !op.define &&
            op.keyName === undefined &&
            op.literalSlot === undefined &&
            op.literalElement === undefined)
    );
}

type State = Set<number> | null;
function intersect(a: State, b: ReadonlySet<number>): Set<number> {
    if (a === null) return new Set(b);
    for (const slot of a) if (!b.has(slot)) a.delete(slot);
    return a;
}
function isNumericOperation(
    operation: Operation,
    state: ReadonlySet<number>,
): boolean {
    if (operation.kind === "binary")
        return (
            (arithmetic.has(operation.operator) ||
                relation.has(operation.operator)) &&
            state.has(operation.left) &&
            state.has(operation.right)
        );
    if (operation.kind === "unary")
        return (
            numericUnary.has(operation.operator) &&
            state.has(operation.argument)
        );
    return false;
}
/** Operators whose result is a Number when one operand is (a BigInt with a Number throws). */
const numberWithNumber = new Set([
    "-",
    "*",
    "/",
    "%",
    "**",
    "&",
    "|",
    "^",
    "<<",
    ">>",
]);
function producesNumber(
    operation: Operation,
    state: ReadonlySet<number>,
): boolean {
    if (operation.kind === "binary") {
        const { operator, left, right } = operation;
        if (operator === ">>>") return true;
        if (
            numberWithNumber.has(operator) &&
            (state.has(left) || state.has(right))
        )
            return true;
        return isNumericOperation(operation, state) && arithmetic.has(operator);
    }
    if (operation.kind === "unary")
        return (
            operation.operator === "+" ||
            (operation.operator === "~" && state.has(operation.argument)) ||
            isNumericOperation(operation, state)
        );
    return false;
}
function step(operation: Operation, state: Set<number>): void {
    if (operation.kind === "constant") {
        if (typeof operation.value === "number") state.add(operation.dest);
        else state.delete(operation.dest);
        return;
    }
    if (operation.kind === "copy") {
        if (state.has(operation.source)) state.add(operation.dest);
        else state.delete(operation.dest);
        return;
    }
    if (operation.kind === "binary" || operation.kind === "unary") {
        if (producesNumber(operation, state)) state.add(operation.dest);
        else state.delete(operation.dest);
        return;
    }
    if (operation.kind === "getIterator") {
        state.delete(operation.iterator);
        state.delete(operation.next);
    }
    if (operation.kind === "iteratorStep") state.delete(operation.done);
    if (operation.kind === "yieldDelegated") state.delete(operation.mode);
    if ("dest" in operation) state.delete(operation.dest);
}

export function markNumericOperations(fn: FunctionIR): FunctionIR {
    if (
        !fn.blocks.some((block) =>
            block.operations.some(
                (op) =>
                    op.kind === "binary" ||
                    op.kind === "unary" ||
                    elementSite(op),
            ),
        )
    )
        return fn;
    const index = new Map(fn.blocks.map((block, i) => [block.id, i]));
    const liveness = analyzeLiveness(fn),
        floor = liveFloor(fn);
    const liveAt = (j: number, state: ReadonlySet<number>): Set<number> => {
        const liveIn = liveness.get(fn.blocks[j]!.id)!.liveIn,
            kept = new Set<number>();
        for (const slot of state)
            if (isLive(liveIn, slot, floor)) kept.add(slot);
        return kept;
    };
    const entry: State[] = fn.blocks.map((_, i) =>
        i === 0 ? new Set<number>() : null,
    );
    const successors = (i: number): number[] => {
        return terminatorTargets(fn.blocks[i]!.terminator);
    };
    const guards = fn.blocks.map(typeofGuard);
    let changed = true;
    while (changed) {
        changed = false;
        fn.blocks.forEach((block, i) => {
            const start = entry[i];
            if (start === null) return;
            const state = new Set(start);
            let everywhere = new Set(start);
            for (const operation of block.operations) {
                step(operation, state);
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
            const guard = guards[i];
            for (const target of successors(i)) {
                if (guard?.target !== target || state.has(guard.slot))
                    flow(target, state);
                else flow(target, new Set([...state, guard.slot]));
            }
            if (block.exceptionTarget !== undefined)
                flow(block.exceptionTarget, everywhere);
        });
    }
    return {
        ...fn,
        blocks: fn.blocks.map((block, i) => {
            const start = entry[i];
            if (start === null) return block;
            const state = new Set(start);
            let marked = false;
            const operations = block.operations.map((operation) => {
                if (elementSite(operation) && state.has(operation.key)) {
                    step(operation, state);
                    marked = true;
                    return { ...operation, numericKey: true } as Operation;
                }
                const numeric = isNumericOperation(operation, state);
                step(operation, state);
                if (!numeric) return operation;
                marked = true;
                // ToNumeric (and unary +) of a Number is the Number itself.
                if (
                    operation.kind === "unary" &&
                    (operation.operator === "numeric" ||
                        operation.operator === "+")
                )
                    return {
                        kind: "copy",
                        dest: operation.dest,
                        source: operation.argument,
                    } as Operation;
                return { ...operation, numeric: true } as Operation;
            });
            return marked ? { ...block, operations } : block;
        }),
    };
}

/**
 * A block that ends in a branch on `typeof x === 'number'` (or `!==`), with
 * x unchanged after the test: x is a Number on the edge where the test holds.
 * (When both targets are the same block, nothing is known there.)
 */
function typeofGuard(
    block: BlockIR,
): { slot: number; target: number } | undefined {
    const t = block.terminator;
    if (t.kind !== "branch" || t.yes === t.no) return undefined;
    const ops = block.operations;
    for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i]!;
        if (!definitions(op).includes(t.condition)) continue;
        if (
            op.kind !== "unary" ||
            (op.operator !== "typeofIs:number" &&
                op.operator !== "typeofNot:number") ||
            op.argument === op.dest
        )
            return undefined;
        if (
            ops
                .slice(i + 1)
                .some((later) => definitions(later).includes(op.argument))
        )
            return undefined;
        return {
            slot: op.argument,
            target: op.operator === "typeofIs:number" ? t.yes : t.no,
        };
    }
    return undefined;
}
