import {
    terminatorTargets,
    terminatorUse,
    type BlockIR,
    type FunctionIR,
    type InductionVariableIR,
    type LoopRepresentationIR,
    type Operation,
    type UnboxedEscapeIR,
    type UnboxedSlotIR,
} from "./model.js";
import { definitions } from "./copies.js";
import {
    analyzeLiveness,
    isLive,
    liveFloor,
    operationUses,
} from "./liveness.js";
import {
    numberStates,
    producesNumber,
    solveForwardMust,
    stepNumbers,
} from "./numbers.js";
import { naturalLoops } from "./typed-loops.js";

/**
 * Representation facts for the code generator (#424, roadmap item 15). The
 * pass changes no operation's meaning; it only annotates the IR.
 *
 * Integer ranges. `& | ^ << >>` with a Number operand and `~` of a Number
 * produce an int32 when they complete (a BigInt mixed with a Number
 * throws), `>>>` always a uint32: they are marked `int32` / `uint32`.
 *
 * Int32 induction variables. A natural loop whose header ends in a branch
 * on `i < bound` (`<=`, `>`, `>=`, operands in either order) into the loop
 * and out of it, where
 *   - i is changed in the loop only by `i++`, `i--`, `i += c`, `i -= c`
 *     (c a slot whose only definitions are one int32 constant), all steps
 *     of one direction and that direction the comparison's (up for `<`,
 *     `<=`, down for `>`, `>=`), the header not changing i, and every step
 *     taken where the comparison held and i has not changed since (no
 *     second step per test, no step reached through an exception edge),
 *   - the loop does not change bound (or sets it to one constant in the
 *     header before the test),
 *   - i holds an int32 on every edge entering the loop,
 * keeps i in int32 range when bound is at most U (counting up) or at least
 * L (counting down): counting up by at most c, `i < bound <= 2^31 - c`
 * gives i <= 2^31 - c - 1 for the integer i, so i + c <= 2^31 - 1, and
 * `i <= bound <= 2^31 - 1 - c` gives the same; counting down is symmetric
 * (`i > bound >= -2^31 + c - 1`, `i >= bound >= -2^31 + c`). The final step
 * past the bound is included: it is the step the inequalities bound. A NaN
 * bound makes the comparison false, so the loop exits and no step runs.
 * When bound is a known constant or an int32 slot the limit is checked
 * here and i is marked `int32` (with its steps); `i < n; i++` with an int32
 * n always qualifies, `i <= n` never does (n may be 2^31 - 1). Otherwise
 * the fact records an `entryCheck`: i stays int32 when bound is a Number
 * within the limit on entry to the loop. As bound does not change in the
 * loop, one test before the loop decides it and the comparison then calls
 * no user code; no guard is needed inside the loop and nothing is
 * deoptimized (the code generator keeps the generic loop for a failed test).
 *
 * The int32 slots are a forward must-analysis (solveForwardMust) that assumes
 * the steps of the candidate variables produce int32s; a candidate whose
 * start or bound does not hold up is dropped and the analysis repeated, so
 * the remaining assumptions are discharged by induction over the steps
 * executed. An int32 slot never holds -0: int32 constants exclude it, and
 * neither int32 steps from a non-negative-zero value nor bit operations
 * produce it.
 *
 * Unboxed slots. Inside a natural loop a slot is eligible when every
 * definition of it in the loop produces a Number (src/ir/numbers.ts: a
 * Number constant, arithmetic on Numbers, a Number-producing operator) or
 * copies an eligible slot, and, when it is live into the header, it holds a
 * Number on every entry. Such a slot can live in an XMM register (or a GPR
 * for an int32) inside the loop: its value is an IEEE double whose
 * operations are the boxed ones, so NaN, the infinities and -0 behave as
 * before (nothing assumes fast-math). Per loop the facts list each eligible
 * slot (read, written, live in) and its escapes: operations that read it as
 * a Value (calls, cells and captures, stores, copies to other slots, any
 * generic operation, return and throw), edges leaving the loop and
 * exception handlers where it is live, and yield/await across which it is
 * live, all of which need the boxed value (`box`), and the reads that take
 * a Number as it is (an element key, a bit operation's ToInt32, a branch).
 *
 * The garbage collector scans only String and Object payloads
 * (docs/runtime-memory.md); a slot that holds Numbers is never a root, so an
 * unboxed value needs no stack map entry. The code generator must still not
 * leave a stale pointer in a slot the stack maps call live: an eligible slot
 * live into the loop holds a Number there already, a temporary defined in
 * the loop must be written (or its tag set to Number) before a safepoint
 * where it is live, or be left out of the maps. Exceptions see the stack
 * slot, so the `handler` escapes say where it must be current.
 *
 * Functions with a mapped arguments object are skipped (their parameters
 * change through it), as are very large functions.
 */

const int32Min = -(2 ** 31),
    int32Max = 2 ** 31 - 1;
const maxBlocks = 4000;
const maxLoops = 32;
const bitwise = new Set(["&", "|", "^", "<<", ">>"]);
const callKinds = new Set<Operation["kind"]>([
    "invoke",
    "call",
    "invokeArray",
    "newInstance",
    "constructForward",
    "constructorResult",
    "derivedReturn",
]);
const cellKinds = new Set<Operation["kind"]>([
    "newCell",
    "writeCell",
    "newFunction",
]);
const storeKinds = new Set<Operation["kind"]>([
    "storeGlobal",
    "setProperty",
    "defineDataProperty",
    "defineField",
    "privateSet",
    "superSet",
    "defineAccessor",
    "newObject",
]);
const suspendKinds = new Set<Operation["kind"]>([
    "yield",
    "await",
    "yieldDelegated",
    "generatorInitialSuspend",
]);

const isInt32 = (value: unknown): value is number =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= int32Min &&
    value <= int32Max &&
    !Object.is(value, -0);

type Comparison = InductionVariableIR["operator"];
const flipped: Record<Comparison, Comparison> = {
    "<": ">",
    "<=": ">=",
    ">": "<",
    ">=": "<=",
};

/** Removes the facts of an earlier run (inlining optimizes a function again). */
function strip(fn: FunctionIR): FunctionIR {
    let changed = false;
    const blocks = fn.blocks.map((block) => {
        if (
            !block.operations.some(
                (op) =>
                    (op.kind === "binary" || op.kind === "unary") &&
                    (op.int32 !== undefined ||
                        (op.kind === "binary" && op.uint32 !== undefined)),
            )
        )
            return block;
        changed = true;
        return {
            ...block,
            operations: block.operations.map((op) => {
                if (op.kind !== "binary" && op.kind !== "unary") return op;
                const {
                    int32: _int32,
                    uint32: _uint32,
                    ...rest
                } = op as typeof op & { uint32?: boolean };
                return rest as Operation;
            }),
        };
    });
    if (!changed && fn.representations === undefined) return fn;
    const { representations: _, ...rest } = fn;
    return { ...rest, blocks };
}

interface Step {
    op: Operation;
    /** The step's constant slot (`i += c`), or -1. */
    constant: number;
}
interface Candidate {
    header: number;
    blocks: Set<number>;
    slot: number;
    operator: Comparison;
    bound: number;
    boundValue?: number;
    step: number;
    steps: Step[];
}

/** The only value a slot ever gets: every definition of it in fn is that constant. */
function constantSlot(
    fn: FunctionIR,
    slot: number,
    defs: ReadonlyMap<number, Operation[]>,
): number | undefined {
    if (slot < fn.parameterCount) return undefined;
    const ds = defs.get(slot);
    if (!ds?.length) return undefined;
    const first = ds[0]!;
    if (first.kind !== "constant" || typeof first.value !== "number")
        return undefined;
    const value = first.value;
    return ds.every(
        (op) => op.kind === "constant" && Object.is(op.value, value),
    )
        ? value
        : undefined;
}

/** The induction variable shape of a loop (see above), before its ranges are checked. */
function inductionShape(
    fn: FunctionIR,
    byId: ReadonlyMap<number, BlockIR>,
    header: number,
    blocks: Set<number>,
    allDefs: ReadonlyMap<number, Operation[]>,
    handlerTargets: ReadonlySet<number>,
): Candidate | undefined {
    if (header === fn.blocks[0]!.id || handlerTargets.has(header))
        return undefined;
    const head = byId.get(header)!,
        t = head.terminator;
    if (
        t.kind !== "branch" ||
        t.yes === t.no ||
        !blocks.has(t.yes) ||
        blocks.has(t.no)
    )
        return undefined;
    const ops = head.operations;
    let at = -1;
    for (let k = ops.length - 1; k >= 0 && at < 0; k--)
        if (definitions(ops[k]!).includes(t.condition)) at = k;
    const compare = ops[at];
    if (
        compare?.kind !== "binary" ||
        !(compare.operator in flipped) ||
        compare.left === compare.right
    )
        return undefined;
    const loopDefs = new Map<number, Operation[]>();
    for (const id of blocks)
        for (const op of byId.get(id)!.operations)
            for (const d of definitions(op)) {
                if (!loopDefs.has(d)) loopDefs.set(d, []);
                loopDefs.get(d)!.push(op);
            }
    const changes = (slot: number) => loopDefs.has(slot);
    let slot: number, bound: number, operator: Comparison;
    if (changes(compare.left) && !changes(compare.right)) {
        slot = compare.left;
        bound = compare.right;
        operator = compare.operator as Comparison;
    } else if (changes(compare.right) && !changes(compare.left)) {
        slot = compare.right;
        bound = compare.left;
        operator = flipped[compare.operator as Comparison];
    } else {
        // The bound may be a temporary the header sets to a constant.
        const headerConstant = (s: number) =>
            ops
                .slice(0, at)
                .some((op) => op.kind === "constant" && op.dest === s);
        if (headerConstant(compare.right) && !headerConstant(compare.left)) {
            slot = compare.left;
            bound = compare.right;
            operator = compare.operator as Comparison;
        } else if (headerConstant(compare.left)) {
            slot = compare.right;
            bound = compare.left;
            operator = flipped[compare.operator as Comparison];
        } else return undefined;
    }
    if (ops.some((op) => definitions(op).includes(slot))) return undefined;
    // The bound: unchanged in the loop, or one constant set in the header.
    let boundValue: number | undefined;
    const boundDefs = loopDefs.get(bound);
    if (boundDefs) {
        const first = boundDefs[0]!;
        if (
            first.kind !== "constant" ||
            typeof first.value !== "number" ||
            !boundDefs.every(
                (op) =>
                    op.kind === "constant" &&
                    Object.is(op.value, (first as { value: number }).value),
            ) ||
            !ops
                .slice(0, at)
                .some((op) => op.kind === "constant" && op.dest === bound) ||
            ops.slice(at + 1).some((op) => definitions(op).includes(bound))
        )
            return undefined;
        boundValue = first.value;
    } else boundValue = constantSlot(fn, bound, allDefs);
    // The steps.
    const up = operator === "<" || operator === "<=";
    const steps: Step[] = [];
    let largest = 0;
    for (const op of loopDefs.get(slot)!) {
        let delta: number | undefined,
            constant = -1;
        if (op.kind === "unary" && op.argument === slot && op.dest === slot)
            delta =
                op.operator === "increment"
                    ? 1
                    : op.operator === "decrement"
                      ? -1
                      : undefined;
        else if (
            op.kind === "binary" &&
            op.dest === slot &&
            (op.operator === "+" || op.operator === "-")
        ) {
            constant =
                op.left === slot
                    ? op.right
                    : op.operator === "+" && op.right === slot
                      ? op.left
                      : -1;
            const value =
                constant >= 0 && constant !== slot
                    ? constantSlot(fn, constant, allDefs)
                    : undefined;
            if (isInt32(value)) delta = op.operator === "+" ? value : -value;
        }
        if (delta === undefined || (delta > 0 && !up) || (delta < 0 && up))
            return undefined;
        largest = Math.max(largest, Math.abs(delta));
        steps.push({ op, constant });
    }
    // Every step is taken where the comparison held, i unchanged since.
    const checkedIn = new Map<number, boolean>();
    for (const id of blocks) checkedIn.set(id, id !== header);
    for (let changed = true; changed;) {
        changed = false;
        const clear = (target: number) => {
            if (blocks.has(target) && checkedIn.get(target)) {
                checkedIn.set(target, false);
                changed = true;
            }
        };
        for (const id of blocks) {
            const block = byId.get(id)!;
            let checked = id !== header && checkedIn.get(id)!;
            for (const op of block.operations) {
                if (op.kind === "pushHandler") clear(op.target);
                if (definitions(op).includes(slot)) checked = false;
            }
            if (block.exceptionTarget !== undefined)
                clear(block.exceptionTarget);
            for (const target of terminatorTargets(block.terminator))
                if (
                    target !== header &&
                    !(id === header ? target === t.yes : checked)
                )
                    clear(target);
        }
    }
    for (const id of blocks) {
        let checked = checkedIn.get(id)!;
        for (const op of byId.get(id)!.operations) {
            if (definitions(op).includes(slot)) {
                if (!checked) return undefined;
                checked = false;
            }
        }
    }
    return {
        header,
        blocks,
        slot,
        operator,
        bound,
        ...(boundValue !== undefined ? { boundValue } : {}),
        step: largest,
        steps,
    };
}

/** The limit a bound must respect (see above). */
function limit(c: Candidate): { max: number } | { min: number } {
    switch (c.operator) {
        case "<":
            return { max: 2 ** 31 - c.step };
        case "<=":
            return { max: int32Max - c.step };
        case ">":
            return { min: int32Min + c.step - 1 };
        case ">=":
            return { min: int32Min + c.step };
    }
}
function within(value: number, l: { max: number } | { min: number }): boolean {
    // NaN: the loop body never runs.
    if (Number.isNaN(value)) return true;
    return "max" in l ? value <= l.max : value >= l.min;
}

/** Annotates fn with integer ranges and loop representation facts (see above). */
export function annotateRepresentations(input: FunctionIR): FunctionIR {
    const fn = strip(input);
    if (fn.blocks.length > maxBlocks) return fn;
    const hasBits = fn.blocks.some((block) =>
        block.operations.some(
            (op) =>
                (op.kind === "binary" &&
                    (bitwise.has(op.operator) || op.operator === ">>>")) ||
                (op.kind === "unary" && op.operator === "~"),
        ),
    );
    const byId = new Map(fn.blocks.map((b) => [b.id, b]));
    const mapped = fn.blocks.some((block) =>
        block.operations.some((op) => op.kind === "newArguments"),
    );
    const loops = mapped ? [] : naturalLoops(fn, byId).slice(0, maxLoops);
    if (!loops.length && !hasBits) return fn;
    const numbers = numberStates(fn);
    // Operations whose result is an int32 (or uint32) whatever the loops do.
    const int32Results = new Set<Operation>(),
        uint32Results = new Set<Operation>(),
        numberResults = new Set<Operation>();
    fn.blocks.forEach((block, i) => {
        const start = numbers[i];
        if (!start) return;
        const state = new Set(start);
        for (const op of block.operations) {
            if (op.kind === "binary") {
                if (op.operator === ">>>") uint32Results.add(op);
                else if (
                    bitwise.has(op.operator) &&
                    (state.has(op.left) || state.has(op.right))
                )
                    int32Results.add(op);
            } else if (
                op.kind === "unary" &&
                op.operator === "~" &&
                state.has(op.argument)
            )
                int32Results.add(op);
            if (
                (op.kind === "constant" && typeof op.value === "number") ||
                producesNumber(op, state)
            )
                numberResults.add(op);
            stepNumbers(op, state);
        }
    });

    // Int32 induction variables.
    const allDefs = new Map<number, Operation[]>(),
        handlerTargets = new Set<number>();
    for (const block of fn.blocks) {
        if (block.exceptionTarget !== undefined)
            handlerTargets.add(block.exceptionTarget);
        for (const op of block.operations) {
            if (op.kind === "pushHandler") handlerTargets.add(op.target);
            for (const d of definitions(op)) {
                if (!allDefs.has(d)) allDefs.set(d, []);
                allDefs.get(d)!.push(op);
            }
        }
    }
    const candidates: Candidate[] = [];
    for (const { header, blocks } of loops) {
        const c = inductionShape(
            fn,
            byId,
            header,
            blocks,
            allDefs,
            handlerTargets,
        );
        if (c) candidates.push(c);
    }
    const index = new Map(fn.blocks.map((b, i) => [b.id, i]));
    let assumed = new Set(candidates),
        assumedSteps = new Set<Operation>(),
        int32: (Set<number> | null)[] = [];
    // The int32 slots across one operation, the assumed steps giving int32s.
    const stepInt32 = (op: Operation, state: Set<number>) => {
        const yes =
            op.kind === "constant"
                ? isInt32(op.value)
                : op.kind === "copy"
                  ? state.has(op.source)
                  : int32Results.has(op) || assumedSteps.has(op);
        for (const d of definitions(op)) state.delete(d);
        if (yes && "dest" in op) state.add(op.dest);
    };
    /** The int32 slots before operation k of block id (k = length: at its end). */
    const int32Before = (id: number, k: number): Set<number> | null => {
        const i = index.get(id)!,
            start = int32[i];
        if (!start) return null;
        const state = new Set(start),
            ops = fn.blocks[i]!.operations;
        for (let j = 0; j < k; j++) stepInt32(ops[j]!, state);
        return state;
    };
    /** Whether c's start and steps hold up; then whether its bound needs no check. */
    const verdict = (c: Candidate): "int32" | "check" | "no" => {
        // i holds an int32 on every edge into the loop.
        let entries = 0;
        for (const block of fn.blocks) {
            if (c.blocks.has(block.id)) continue;
            if (!terminatorTargets(block.terminator).includes(c.header))
                continue;
            const out = int32Before(block.id, block.operations.length);
            if (out === null) continue;
            if (!out.has(c.slot)) return "no";
            entries++;
        }
        if (!entries) return "no";
        // `i += c`: c holds its constant there.
        for (const s of c.steps) {
            if (s.constant < 0) continue;
            for (const id of c.blocks) {
                const k = byId.get(id)!.operations.indexOf(s.op);
                if (k < 0) continue;
                const before = int32Before(id, k);
                if (before && !before.has(s.constant)) return "no";
            }
        }
        const l = limit(c);
        if (c.boundValue !== undefined)
            return within(c.boundValue, l) ? "int32" : "no";
        const atHeader = int32[index.get(c.header)!];
        if (
            atHeader?.has(c.bound) &&
            within("max" in l ? int32Max : int32Min, l)
        )
            return "int32";
        return "check";
    };
    let verdicts = new Map<Candidate, "int32" | "check" | "no">();
    for (;;) {
        assumedSteps = new Set(
            [...assumed].flatMap((c) => c.steps.map((s) => s.op)),
        );
        int32 = solveForwardMust(fn, stepInt32);
        verdicts = new Map(candidates.map((c) => [c, verdict(c)]));
        const kept = new Set(
            [...assumed].filter((c) => verdicts.get(c) === "int32"),
        );
        if (kept.size === assumed.size) break;
        assumed = kept;
    }
    // (Fewer assumptions cannot prove more: a dropped candidate stays dropped.)
    for (const c of candidates)
        if (verdicts.get(c) === "int32" && !assumed.has(c))
            verdicts.set(c, "check");
    const int32Steps = assumedSteps;

    // Marks.
    const marked = fn.blocks.map((block) => {
        if (
            !block.operations.some(
                (op) =>
                    int32Results.has(op) ||
                    uint32Results.has(op) ||
                    int32Steps.has(op),
            )
        )
            return block;
        return {
            ...block,
            operations: block.operations.map((op) =>
                int32Results.has(op) || int32Steps.has(op)
                    ? ({ ...op, int32: true } as Operation)
                    : uint32Results.has(op)
                      ? ({ ...op, uint32: true } as Operation)
                      : op,
            ),
        };
    });

    // Unboxed slots per loop.
    const representations: LoopRepresentationIR[] = [];
    if (loops.length) {
        const liveness = analyzeLiveness(fn),
            floor = liveFloor(fn);
        for (const { header, blocks: members } of loops) {
            const h = index.get(header)!,
                atHeader = numbers[h];
            if (!atHeader) continue;
            const loopBlocks = fn.blocks.filter((b) => members.has(b.id));
            loopBlocks.sort(
                (x, y) => Number(y.id === header) - Number(x.id === header),
            );
            const induction: InductionVariableIR[] = [];
            for (const c of candidates) {
                if (c.header !== header) continue;
                const v = verdicts.get(c);
                if (v === "no" || v === undefined) continue;
                induction.push({
                    slot: c.slot,
                    operator: c.operator,
                    bound: c.bound,
                    ...(c.boundValue !== undefined
                        ? { boundValue: c.boundValue }
                        : {}),
                    step: c.step,
                    int32: v === "int32",
                    ...(v === "check" ? { entryCheck: limit(c) } : {}),
                });
            }
            const facts = unboxedSlots(
                loopBlocks,
                members,
                liveness,
                floor,
                atHeader,
                numberResults,
            );
            for (const u of facts.unboxed)
                if (induction.some((x) => x.int32 && x.slot === u.slot))
                    u.int32 = true;
            if (!induction.length && !facts.unboxed.length) continue;
            representations.push({
                header,
                blocks: loopBlocks.map((b) => b.id),
                induction,
                unboxed: facts.unboxed,
                escapes: facts.escapes,
            });
        }
    }
    return {
        ...fn,
        ...(representations.length ? { representations } : {}),
        blocks: marked,
    };
}

/** The eligible slots of one loop and their escapes (see above). */
function unboxedSlots(
    loop: readonly BlockIR[],
    members: ReadonlySet<number>,
    liveness: ReturnType<typeof analyzeLiveness>,
    floor: number,
    atHeader: ReadonlySet<number>,
    numberResults: ReadonlySet<Operation>,
): { unboxed: UnboxedSlotIR[]; escapes: UnboxedEscapeIR[] } {
    const header = loop[0]!;
    const liveIn = liveness.get(header.id)!.liveIn;
    const read = new Set<number>(),
        written = new Set<number>(),
        copies: { dest: number; source: number }[] = [];
    const rejected = new Set<number>();
    for (const block of loop) {
        for (const op of block.operations) {
            for (const u of operationUses(op)) read.add(u);
            for (const d of definitions(op)) {
                written.add(d);
                if (op.kind === "copy") copies.push(op);
                else if (!numberResults.has(op) || definitions(op).length > 1)
                    rejected.add(d);
            }
        }
        const use = terminatorUse(block.terminator);
        if (use >= 0) read.add(use);
    }
    const eligible = new Set<number>();
    for (const slot of new Set([...read, ...written]))
        if (
            !rejected.has(slot) &&
            (!isLive(liveIn, slot, floor) || atHeader.has(slot))
        )
            eligible.add(slot);
    // A copy of an ineligible slot makes its destination ineligible.
    for (let changed = true; changed;) {
        changed = false;
        for (const { dest, source } of copies)
            if (eligible.has(dest) && !eligible.has(source)) {
                eligible.delete(dest);
                changed = true;
            }
    }
    const escapes: UnboxedEscapeIR[] = [];
    const escape = (
        slot: number,
        kind: UnboxedEscapeIR["kind"],
        block: number,
        index: number,
        box: boolean,
        target?: number,
    ) =>
        escapes.push({
            slot,
            kind,
            block,
            index,
            ...(target !== undefined ? { target } : {}),
            box,
        });
    for (const block of loop) {
        const ops = block.operations,
            live = liveness.get(block.id)!;
        ops.forEach((op, k) => {
            for (const slot of operationUses(op)) {
                if (!eligible.has(slot)) continue;
                const use = classify(op, slot, eligible);
                if (use) escape(slot, use.kind, block.id, k, use.box);
            }
            if (suspendKinds.has(op.kind)) {
                const after = live.before[k + 1] ?? live.beforeTerminator;
                for (const slot of eligible)
                    if (
                        isLive(after, slot, floor) &&
                        !definitions(op).includes(slot)
                    )
                        escape(slot, "suspend", block.id, k, true);
            }
        });
        const t = block.terminator,
            use = terminatorUse(t);
        if (use >= 0 && eligible.has(use))
            escape(
                use,
                t.kind === "branch"
                    ? "branch"
                    : t.kind === "return"
                      ? "return"
                      : t.kind === "throw"
                        ? "throw"
                        : "generic",
                block.id,
                -1,
                t.kind !== "branch",
            );
        for (const target of new Set(terminatorTargets(t))) {
            if (members.has(target)) continue;
            const into = liveness.get(target)!.liveIn;
            for (const slot of eligible)
                if (isLive(into, slot, floor))
                    escape(slot, "exit", block.id, -1, true, target);
        }
        const handlers = new Set<number>();
        if (block.exceptionTarget !== undefined)
            handlers.add(block.exceptionTarget);
        for (const op of ops)
            if (op.kind === "pushHandler") handlers.add(op.target);
        for (const target of handlers) {
            const into = liveness.get(target)?.liveIn;
            if (!into) continue;
            for (const slot of eligible)
                if (isLive(into, slot, floor))
                    escape(slot, "handler", block.id, -1, true, target);
        }
    }
    const unboxed = [...eligible]
        .sort((x, y) => x - y)
        .map((slot) => ({
            slot,
            read: read.has(slot),
            written: written.has(slot),
            liveIn: isLive(liveIn, slot, floor),
        }));
    return { unboxed, escapes };
}

/** How op reads the unboxed slot (undefined: as a Number operand of a Number operation). */
function classify(
    op: Operation,
    slot: number,
    eligible: ReadonlySet<number>,
): { kind: UnboxedEscapeIR["kind"]; box: boolean } | undefined {
    switch (op.kind) {
        case "copy":
            return eligible.has(op.dest)
                ? undefined
                : { kind: "copy", box: true };
        case "binary":
            if (op.numeric) return undefined;
            if (bitwise.has(op.operator) || op.operator === ">>>")
                return { kind: "convert", box: false };
            return { kind: "generic", box: true };
        case "unary":
            if (op.numeric) return undefined;
            if (op.operator === "~") return { kind: "convert", box: false };
            return { kind: "generic", box: true };
        case "property":
            return op.key === slot && op.numericKey && op.object !== slot
                ? { kind: "key", box: false }
                : { kind: "generic", box: true };
        case "setProperty":
            if (op.source === slot) return { kind: "store", box: true };
            return op.key === slot && op.numericKey && op.object !== slot
                ? { kind: "key", box: false }
                : { kind: "generic", box: true };
    }
    if (callKinds.has(op.kind)) return { kind: "call", box: true };
    if (cellKinds.has(op.kind)) return { kind: "cell", box: true };
    if (storeKinds.has(op.kind)) return { kind: "store", box: true };
    if (suspendKinds.has(op.kind)) return { kind: "suspend", box: true };
    return { kind: "generic", box: true };
}
