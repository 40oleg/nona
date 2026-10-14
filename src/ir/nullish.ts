import {
    terminatorTargets,
    type BlockIR,
    type FunctionIR,
    type Operation,
} from "./model.js";
import { definitions } from "./copies.js";
import { analyzeLiveness, isLive, liveFloor } from "./liveness.js";

/**
 * Path-sensitive "not nullish" facts (#237, #146 item 13): a forward
 * must-analysis of the slots that cannot hold null and of those that cannot
 * hold undefined. A `unary isNullish` (the test of `x?.y`, `x ?? y`) of a
 * slot that can hold neither folds to false, and constant folding then
 * removes the branch on it:
 *
 *     if (x === null || x === undefined) return fallback;
 *     return x?.value; // no second test
 *
 * Facts come from the edges of branches on a test of the slot made in the
 * same block (the slot unchanged after the test): `x === null` (not null on
 * the false edge; `!==` the true edge), `x === undefined`, `x == null` and
 * `x != null` (neither), `isNullish x`, and `typeof x` tests. Values that
 * are never nullish (non-nullish constants, objects, functions, arithmetic
 * results) carry the facts from their definition. A copy passes them on;
 * any other write of the slot removes them. Reads of cells, globals and
 * properties start without facts, so a closure or eval writing the binding
 * cannot invalidate them. Functions with a mapped arguments object (which
 * can write parameter slots) are left unchanged.
 */
type State = Set<number> | null;
// Facts of slot s: 2s it is not null, 2s + 1 it is not undefined.
const notNull = (slot: number) => 2 * slot,
    notUndefined = (slot: number) => 2 * slot + 1;

function intersect(a: State, b: ReadonlySet<number>): Set<number> {
    if (a === null) return new Set(b);
    for (const fact of a) if (!b.has(fact)) a.delete(fact);
    return a;
}

const nonNullishKinds = new Set<Operation["kind"]>([
    "newObject",
    "newFunction",
    "realmFunction",
    "newRestArray",
    "binary",
]);

function step(operation: Operation, state: Set<number>): void {
    if (operation.kind === "copy") {
        const known = [
            state.has(notNull(operation.source)),
            state.has(notUndefined(operation.source)),
        ];
        state.delete(notNull(operation.dest));
        state.delete(notUndefined(operation.dest));
        if (known[0]) state.add(notNull(operation.dest));
        if (known[1]) state.add(notUndefined(operation.dest));
        return;
    }
    for (const slot of definitions(operation)) {
        state.delete(notNull(slot));
        state.delete(notUndefined(slot));
    }
    if (!("dest" in operation)) return;
    const never =
        nonNullishKinds.has(operation.kind) ||
        (operation.kind === "unary" && operation.operator !== "void") ||
        (operation.kind === "constant" &&
            operation.value !== null &&
            operation.value !== undefined);
    if (never) {
        state.add(notNull(operation.dest));
        state.add(notUndefined(operation.dest));
    }
}

/** The facts a block's branch adds on its true and false edges. */
interface Guard {
    yes: number[];
    no: number[];
}

export function branchGuard(
    block: BlockIR,
    nullish: ReadonlyMap<number, null | undefined>,
): Guard | undefined {
    const t = block.terminator;
    if (t.kind !== "branch" || t.yes === t.no) return undefined;
    const ops = block.operations;
    for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i]!;
        if (!definitions(op).includes(t.condition)) continue;
        let tested: number | undefined, guard: Guard | undefined;
        if (op.kind === "unary" && op.argument !== op.dest) {
            const a = op.argument,
                both = [notNull(a), notUndefined(a)];
            tested = a;
            if (op.operator === "isNullish") guard = { yes: [], no: both };
            else {
                const match = /^typeof(Is|Not):(.*)$/.exec(op.operator);
                if (match) {
                    const type = match[2]!,
                        holds =
                            type === "undefined"
                                ? []
                                : type === "object"
                                  ? [notUndefined(a)]
                                  : both,
                        fails = type === "undefined" ? [notUndefined(a)] : [];
                    guard =
                        match[1] === "Is"
                            ? { yes: holds, no: fails }
                            : { yes: fails, no: holds };
                }
            }
        } else if (
            op.kind === "binary" &&
            ["===", "!==", "==", "!="].includes(op.operator)
        ) {
            const [a, constant] = nullish.has(op.right)
                ? [op.left, op.right]
                : nullish.has(op.left)
                  ? [op.right, op.left]
                  : [undefined, undefined];
            if (a !== undefined && a !== op.dest) {
                tested = a;
                const loose = op.operator === "==" || op.operator === "!=",
                    facts = loose
                        ? [notNull(a), notUndefined(a)]
                        : nullish.get(constant!) === null
                          ? [notNull(a)]
                          : [notUndefined(a)];
                guard =
                    op.operator === "===" || op.operator === "=="
                        ? { yes: [], no: facts }
                        : { yes: facts, no: [] };
            }
        }
        if (tested === undefined || !guard) return undefined;
        // The tested slot must be unchanged up to the branch.
        if (
            ops
                .slice(i + 1)
                .some((later) => definitions(later).includes(tested))
        )
            return undefined;
        return guard;
    }
    return undefined;
}

export function foldNullishTests(fn: FunctionIR): FunctionIR {
    if (
        !fn.blocks.some((block) =>
            block.operations.some(
                (op) => op.kind === "unary" && op.operator === "isNullish",
            ),
        ) ||
        fn.blocks.some((block) =>
            block.operations.some((op) => op.kind === "newArguments"),
        )
    )
        return fn;
    // Slots defined once, by a null or undefined constant.
    const counts = new Map<number, number>(),
        nullish = new Map<number, null | undefined>();
    for (const block of fn.blocks)
        for (const op of block.operations) {
            for (const d of definitions(op))
                counts.set(d, (counts.get(d) ?? 0) + 1);
            if (
                op.kind === "constant" &&
                (op.value === null || op.value === undefined)
            )
                nullish.set(op.dest, op.value);
        }
    for (const slot of [...nullish.keys()])
        if (counts.get(slot) !== 1 || slot < fn.localCount)
            nullish.delete(slot);
    const index = new Map(fn.blocks.map((block, i) => [block.id, i]));
    const liveness = analyzeLiveness(fn),
        floor = liveFloor(fn);
    const liveAt = (j: number, state: ReadonlySet<number>): Set<number> => {
        const liveIn = liveness.get(fn.blocks[j]!.id)!.liveIn,
            kept = new Set<number>();
        for (const fact of state)
            if (isLive(liveIn, fact >> 1, floor)) kept.add(fact);
        return kept;
    };
    const entry: State[] = fn.blocks.map((_, i) =>
        i === 0 ? new Set<number>() : null,
    );
    const guards = fn.blocks.map((block) => branchGuard(block, nullish));
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
            const t = block.terminator,
                guard = guards[i];
            if (t.kind === "branch" && guard) {
                flow(t.yes, new Set([...state, ...guard.yes]));
                flow(t.no, new Set([...state, ...guard.no]));
            } else
                for (const target of terminatorTargets(t)) flow(target, state);
            if (block.exceptionTarget !== undefined)
                flow(block.exceptionTarget, everywhere);
        });
    }
    let folded = false;
    const blocks = fn.blocks.map((block, i) => {
        const start = entry[i];
        if (start === null) return block;
        const state = new Set(start);
        let changedBlock = false;
        const operations = block.operations.map((operation) => {
            const known =
                operation.kind === "unary" &&
                operation.operator === "isNullish" &&
                state.has(notNull(operation.argument)) &&
                state.has(notUndefined(operation.argument));
            step(operation, state);
            if (!known) return operation;
            changedBlock = true;
            return {
                kind: "constant",
                dest: (operation as { dest: number }).dest,
                value: false,
            } as Operation;
        });
        if (!changedBlock) return block;
        folded = true;
        return { ...block, operations };
    });
    return folded ? { ...fn, blocks } : fn;
}
