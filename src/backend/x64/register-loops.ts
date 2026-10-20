import {
    type BlockIR,
    type FunctionIR,
    type InductionVariableIR,
    type Operation,
} from "../../ir/model.js";
import { isLive, type BlockLiveness } from "../../ir/liveness.js";
import { destinations } from "../../ir/locations.js";
import type { Reg, Xmm } from "./assembler.js";

/**
 * Register-resident Numbers in loops (#424, roadmap item 15): the plan the
 * code generator (operations.ts) follows for the loops that
 * src/ir/representations.ts annotated.
 *
 * A planned loop is emitted as a register copy: on entry its int32 induction
 * variables and integer temporaries move into callee-saved GPRs (R12-R15,
 * kept as sign-extended int64s: `i++` is `add`, `i & m` is `and`, a typed
 * array index is the register) and its written double slots into XMM2-XMM4
 * (XMM5 is the conversion scratch of the write-backs). Inside the copy the
 * frame slot of a register-resident slot is stale. It is written back as a
 * boxed Number (tag 3 and the double; cvtsi2sd for an integer)
 *   - before every call the copy makes (runtime calls, safepoint polls,
 *     gcStress collections, slow paths, throws): every such slot live there
 *     is written, so the stack maps, the collector, the runtime and an
 *     exception handler outside the loop all see valid Values, and the
 *     XMM registers (volatile in the runtime ABI) are reloaded after it;
 *   - before an operation the copy has no register form for, which then
 *     runs unchanged on the frame slots (its destination is reloaded);
 *   - on every edge leaving the loop, for the slots live into its target,
 *     and before a return.
 * Numbers are no roots (docs/runtime-memory.md), so a register needs no map
 * entry of its own; written back, its slot is an ordinary live Number.
 *
 * The GPRs are saved in the frame on entry and restored on every exit and
 * return. An exception that leaves the loop restores them from its handler
 * record (pushed outside the loop) or its caller's: loops that push a
 * handler, are entered by one or suspend are not planned, nor are slots live
 * into a handler.
 *
 * An induction variable whose int32 range depends on its bound (an
 * `entryCheck`) gets its register copy only when the bound is, on entry, an
 * integral Number within the limit: the loop is then emitted twice, and a
 * failed test runs the unchanged copy. Nothing is deoptimized inside a loop.
 * Integer comparisons of the induction variable with its bound (a constant,
 * or the bound converted once on entry) replace the double ones: an integral
 * bound gives the same order. Doubles keep their IEEE operations, so NaN,
 * the infinities and -0 behave as before (an integer slot never holds -0).
 */

export type IntegerKind = "int32" | "uint32" | "int53";
export interface RegisterLoop {
    header: number;
    /** The loop's blocks, in the function's order with the header first. */
    blocks: number[];
    members: ReadonlySet<number>;
    /** Integer slots: the GPR and the range of the values. */
    integers: Map<number, { reg: Reg; kind: IntegerKind }>;
    /** Double slots. */
    doubles: Map<number, Xmm>;
    /** Read-only bound slots held as int64s from the entry (their frame slots stay current). */
    bounds: Map<number, Reg>;
    /** Bounds tested on entry: an integral Number within the limit, or the unchanged copy runs. */
    checks: { slot: number; reg: Reg; max?: number; min?: number }[];
    /** Induction steps (`i++`, `i += c`) that are int32 adds in the register copy. */
    steps: Set<Operation>;
    /** The header's comparisons of an induction variable with its bound that only decide its branch: of two Numbers in the register copy, fused into the branch. */
    compares: Set<Operation>;
    /** The callee-saved GPRs to save on entry and restore on exit. */
    saved: Reg[];
}

// NONA_REGISTER_LOOPS=off keeps every loop boxed (to measure the effect).
const disabled = globalThis.process?.env?.NONA_REGISTER_LOOPS === "off";
const gprs: readonly Reg[] = ["r12", "r13", "r14", "r15"];
const xmms: readonly Xmm[] = ["xmm2", "xmm3", "xmm4"];
const maxLoopBlocks = 64,
    maxLoopOperations = 600;
const suspendKinds = new Set<Operation["kind"]>([
    "yield",
    "await",
    "yieldDelegated",
    "generatorInitialSuspend",
]);
const int32Constant = (value: unknown): value is number =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= -(2 ** 31) &&
    value < 2 ** 31 &&
    !Object.is(value, -0);

/** The plan of every loop of fn that keeps Numbers in registers (see above). */
export function planRegisterLoops(
    fn: FunctionIR,
    liveness: ReadonlyMap<number, BlockLiveness>,
    floor: number,
    /** The slot's only value is this constant (a static constant of the code generator). */
    constantOf: (slot: number) => { value: unknown } | undefined,
): RegisterLoop[] {
    const loops = fn.representations;
    if (disabled || !loops?.length || fn.generator) return [];
    const byId = new Map(fn.blocks.map((b) => [b.id, b]));
    const handlerTargets = new Set<number>();
    for (const block of fn.blocks) {
        if (block.exceptionTarget !== undefined)
            handlerTargets.add(block.exceptionTarget);
        for (const op of block.operations) {
            if (suspendKinds.has(op.kind)) return [];
            if (op.kind === "pushHandler") handlerTargets.add(op.target);
        }
    }
    const plans: RegisterLoop[] = [];
    const taken = new Set<number>();
    const ordered = [...loops].sort((x, y) => x.blocks.length - y.blocks.length);
    for (const loop of ordered) {
        const members = new Set(loop.blocks);
        if (
            loop.header === fn.blocks[0]!.id ||
            members.size > maxLoopBlocks ||
            loop.blocks.some((id) => taken.has(id) || handlerTargets.has(id))
        )
            continue;
        const blocks = loop.blocks.map((id) => byId.get(id));
        if (blocks.some((b) => !b || !liveness.has(b.id))) continue;
        const loopBlocks = blocks as BlockIR[];
        if (
            loopBlocks.some(
                (b) =>
                    b.terminator.kind === "switch" ||
                    b.operations.some(
                        (op) =>
                            op.kind === "pushHandler" ||
                            op.kind === "popHandler",
                    ),
            ) ||
            loopBlocks.reduce((n, b) => n + b.operations.length, 0) >
                maxLoopOperations
        )
            continue;
        const plan = planLoop(
            fn,
            loop.header,
            loopBlocks,
            members,
            loop.induction,
            loop.unboxed,
            loop.escapes,
            liveness,
            floor,
            constantOf,
        );
        if (!plan) continue;
        for (const id of members) taken.add(id);
        plans.push(plan);
    }
    return plans;
}

function planLoop(
    fn: FunctionIR,
    header: number,
    loopBlocks: BlockIR[],
    members: ReadonlySet<number>,
    induction: readonly InductionVariableIR[],
    unboxed: NonNullable<FunctionIR["representations"]>[number]["unboxed"],
    escapes: NonNullable<FunctionIR["representations"]>[number]["escapes"],
    liveness: ReadonlyMap<number, BlockLiveness>,
    floor: number,
    constantOf: (slot: number) => { value: unknown } | undefined,
): RegisterLoop | undefined {
    const excluded = new Set<number>();
    for (const e of escapes)
        if (e.kind === "handler" || e.kind === "suspend") excluded.add(e.slot);
    const candidate = (slot: number) =>
        slot >= floor && !excluded.has(slot) && !constantOf(slot);
    const defs = new Map<number, Operation[]>();
    for (const block of loopBlocks)
        for (const op of block.operations)
            for (const d of destinations(op)) {
                if (!defs.has(d)) defs.set(d, []);
                defs.get(d)!.push(op);
            }
    const liveIn = liveness.get(header)!.liveIn;
    const eligible = new Map(unboxed.map((u) => [u.slot, u]));
    const intConstant = (slot: number): number | undefined => {
        const c = constantOf(slot);
        return c && int32Constant(c.value) ? c.value : undefined;
    };
    const integers = new Map<number, { reg: Reg; kind: IntegerKind }>(),
        doubles = new Map<number, Xmm>(),
        bounds = new Map<number, Reg>(),
        checks: RegisterLoop["checks"] = [],
        steps = new Set<Operation>(),
        compares = new Set<Operation>();
    const head = loopBlocks[0]!,
        test = head.terminator;
    // The comparison that only decides the header's branch (fused into it).
    const last = head.operations[head.operations.length - 1];
    const compare =
        test.kind === "branch" &&
        last?.kind === "binary" &&
        last.dest === test.condition &&
        !isLive(liveness.get(header)!.liveOut, last.dest, floor)
            ? last
            : undefined;
    const free = [...gprs];
    // Induction variables: the steps are int32 adds once the bound holds.
    for (const iv of induction) {
        if (!candidate(iv.slot) || !eligible.has(iv.slot) || !free.length)
            continue;
        if (!iv.int32 && !iv.entryCheck) continue;
        const ivSteps: Operation[] = [];
        const ok = (defs.get(iv.slot) ?? []).every((op) => {
            if (
                op.kind === "unary" &&
                op.argument === iv.slot &&
                (op.operator === "increment" || op.operator === "decrement")
            ) {
                ivSteps.push(op);
                return true;
            }
            if (
                op.kind === "binary" &&
                (op.operator === "+" || op.operator === "-")
            ) {
                const other =
                    op.left === iv.slot
                        ? op.right
                        : op.operator === "+" && op.right === iv.slot
                          ? op.left
                          : -1;
                if (other >= 0 && intConstant(other) !== undefined) {
                    ivSteps.push(op);
                    return true;
                }
            }
            return false;
        });
        if (!ok || !ivSteps.length) continue;
        // The bound: a constant, or an int64 converted on entry (and tested
        // there for an entryCheck); without a register for it, an int32
        // bound is compared as a double.
        const known =
            iv.boundValue !== undefined ||
            intConstant(iv.bound) !== undefined;
        const shared = bounds.get(iv.bound);
        const boundReg =
            known || shared ? undefined : free.length >= 2 ? free[1] : undefined;
        // (A shared bound was tested for its first variable: the limits
        // differ per variable, so a second checked one is left boxed.)
        if (iv.entryCheck && !boundReg) continue;
        integers.set(iv.slot, { reg: free.shift()!, kind: "int32" });
        if (boundReg) {
            free.splice(free.indexOf(boundReg), 1);
            bounds.set(iv.bound, boundReg);
            if (iv.entryCheck)
                checks.push({
                    slot: iv.bound,
                    reg: boundReg,
                    ...iv.entryCheck,
                });
        }
        for (const s of ivSteps) steps.add(s);
        if (
            compare &&
            ((compare.left === iv.slot && compare.right === iv.bound) ||
                (compare.right === iv.slot && compare.left === iv.bound))
        )
            compares.add(compare);
    }
    // Integer temporaries: every definition in the loop an int32 / uint32
    // operation or an int32 slot plus or minus an int32 constant (int53).
    const kinds = new Map<number, IntegerKind>();
    const int32Kind = (slot: number) =>
        kinds.get(slot) === "int32" || kinds.get(slot) === "uint32";
    const temporaryKind = (slot: number): IntegerKind | undefined => {
        let kind: IntegerKind | undefined;
        for (const op of defs.get(slot) ?? []) {
            let k: IntegerKind | undefined;
            if (
                (op.kind === "binary" || op.kind === "unary") &&
                op.int32 &&
                !(op.kind === "unary" && op.operator !== "~")
            )
                k = "int32";
            else if (op.kind === "binary" && op.uint32) k = "uint32";
            else if (
                op.kind === "binary" &&
                op.numeric &&
                (op.operator === "+" || op.operator === "-") &&
                ((int32Kind(op.left) && intConstant(op.right) !== undefined) ||
                    (op.operator === "+" &&
                        int32Kind(op.right) &&
                        intConstant(op.left) !== undefined))
            )
                k = "int53";
            if (!k || (kind && kind !== k)) return undefined;
            kind = k;
        }
        return kind;
    };
    const temporaries: number[] = [];
    for (const [slot, { kind }] of integers) kinds.set(slot, kind);
    // (int53 temporaries in a second pass, after the int32 ones they add to.)
    for (const pass of [0, 1])
        for (const u of unboxed) {
            if (
                kinds.has(u.slot) ||
                !candidate(u.slot) ||
                bounds.has(u.slot) ||
                u.liveIn ||
                isLive(liveIn, u.slot, floor)
            )
                continue;
            const kind = temporaryKind(u.slot);
            if (!kind || (kind === "int53") !== (pass === 1)) continue;
            kinds.set(u.slot, kind);
            temporaries.push(u.slot);
        }
    // Double slots written in the loop whose reads take the double as it is
    // (a slot read as a Value in every iteration would be written back in
    // every iteration).
    const byBlock = new Map(loopBlocks.map((b) => [b.id, b]));
    const boxedReads = new Set<number>();
    for (const e of escapes) {
        if (e.kind === "exit" || e.kind === "return" || e.kind === "throw")
            continue;
        const op = byBlock.get(e.block)?.operations[e.index];
        if (
            e.kind === "convert" &&
            op &&
            destinations(op).some((d) => kinds.has(d))
        )
            continue;
        boxedReads.add(e.slot);
    }
    const doubleCandidates = unboxed
        .filter(
            (u) =>
                u.written &&
                candidate(u.slot) &&
                !kinds.has(u.slot) &&
                !bounds.has(u.slot) &&
                !boxedReads.has(u.slot) &&
                // A copy from an integer slot would change representation.
                !(defs.get(u.slot) ?? []).some(
                    (op) => op.kind === "copy" && kinds.has(op.source),
                ),
        )
        .map((u) => u.slot);
    // Temporaries share registers when their live ranges in the loop do not
    // meet (a definition meets every slot live before or after it).
    const meets = interference(
        loopBlocks,
        liveness,
        floor,
        new Set([...temporaries, ...doubleCandidates]),
    );
    const assign = <R>(slots: number[], pool: readonly R[]) => {
        const result = new Map<number, R>();
        for (const slot of slots) {
            const taken = new Set<R>();
            for (const other of meets.get(slot) ?? [])
                if (result.has(other)) taken.add(result.get(other)!);
            const reg = pool.find((r) => !taken.has(r));
            if (reg !== undefined) result.set(slot, reg);
        }
        return result;
    };
    for (const [slot, reg] of assign(temporaries, free))
        integers.set(slot, { reg, kind: kinds.get(slot)! });
    for (const [slot, reg] of assign(doubleCandidates, xmms))
        doubles.set(slot, reg);
    if (!integers.size && !doubles.size) return undefined;
    const used = new Set<Reg>([
        ...[...integers.values()].map((i) => i.reg),
        ...bounds.values(),
    ]);
    return {
        header,
        blocks: [
            header,
            ...fn.blocks
                .map((b) => b.id)
                .filter((id) => members.has(id) && id !== header),
        ],
        members,
        integers,
        doubles,
        bounds,
        checks,
        steps,
        compares,
        saved: gprs.filter((r) => used.has(r)),
    };
}

/** For each of the slots, the others whose live ranges in the loop meet its own. */
function interference(
    loop: readonly BlockIR[],
    liveness: ReadonlyMap<number, BlockLiveness>,
    floor: number,
    slots: ReadonlySet<number>,
): Map<number, Set<number>> {
    const meets = new Map<number, Set<number>>();
    const add = (x: number, y: number) => {
        if (x === y) return;
        if (!meets.has(x)) meets.set(x, new Set());
        if (!meets.has(y)) meets.set(y, new Set());
        meets.get(x)!.add(y);
        meets.get(y)!.add(x);
    };
    const list = [...slots];
    for (const block of loop) {
        const l = liveness.get(block.id)!,
            points = [...l.before, l.beforeTerminator];
        for (const point of points) {
            const live = list.filter((n) => isLive(point, n, floor));
            for (let i = 0; i < live.length; i++)
                for (let j = i + 1; j < live.length; j++)
                    add(live[i]!, live[j]!);
        }
        block.operations.forEach((op, k) => {
            for (const d of destinations(op)) {
                if (!slots.has(d)) continue;
                for (const n of list)
                    if (
                        isLive(points[k]!, n, floor) ||
                        isLive(points[k + 1]!, n, floor)
                    )
                        add(d, n);
            }
        });
    }
    return meets;
}
