import {
    terminatorTargets,
    terminatorUse,
    type BlockIR,
    type FunctionIR,
    type Operation,
    type Terminator,
} from "./model.js";
import { definitions } from "./copies.js";
import {
    analyzeLiveness,
    isLive,
    liveFloor,
    operationUses,
} from "./liveness.js";

/**
 * Loop versioning for typed array loops (#240, part 2). A counted loop
 *
 *     for (let i = start; i < bound; i++) ... a[i] ... b[i] = v ...
 *
 * whose body cannot run user code gets a guard on its entry edges: when the
 * receivers are typed arrays over fixed-length, attached, non-shared
 * ArrayBuffers whose `length` is the intrinsic getter, start is an integer
 * Number >= 0 and bound a Number no greater than every receiver's length
 * (bound `a.length` is the first receiver's), control enters a copy of the
 * loop whose element accesses are marked `unchecked` and whose `a.length`
 * reads are marked `typedLength`; otherwise it enters the loop unchanged.
 * In the copy nothing can detach or resize a buffer, change a prototype or
 * reassign a receiver, so every `a[i]` on the true edge of `i < bound` (i not
 * changed since) is an element that exists: the code generator reads and
 * writes it without receiver, attachment or range tests.
 *
 * The analysis is deliberately small. Loops are natural loops (a back edge
 * to a block that dominates its source); the header must end in a branch on
 * `i < bound` into the loop and out of it; i is changed in the loop only by
 * `i++`; receivers and a bound that is not `a.length` are slots the loop does
 * not write, or temporaries loaded from script bindings it does not store;
 * every element access in the loop uses key i. Operations are whitelisted:
 * constants, copies, script binding loads and stores, dead-zone markers and
 * checks,
 * the arithmetic, bitwise, comparison and conversion operators that call no
 * user code on primitives, element reads and writes of the receivers and
 * their `length`. A conversion of an object would call valueOf: the slots
 * and bindings such operands (and stored values) come from must hold
 * primitives when the loop is entered, which the guard checks too; inside
 * the loop they are only assigned results of whitelisted operations, which
 * are primitives. Calls, other property accesses, `in`, `instanceof`,
 * allocation, yield/await and exception handlers inside the loop disqualify
 * it.
 *
 * Temporaries that live only inside the loop are renamed in the copy (so a
 * constant keeps its single definition); every other slot is shared by both
 * versions, which leaves liveness and the stack maps as for any other code.
 */

const maxLoops = 8;
const maxGuardArguments = 16;
const coercing = new Set([
    "+",
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
    ">>>",
    "<",
    "<=",
    ">",
    ">=",
    "==",
    "!=",
]);
/** Operators that never convert their operands. */
const inspecting = new Set(["===", "!=="]);
const unaryCoercing = new Set([
    "+",
    "-",
    "~",
    "numeric",
    "increment",
    "decrement",
]);
const unaryInspecting = (operator: string) =>
    operator === "!" ||
    operator === "typeof" ||
    operator === "isNullish" ||
    operator.startsWith("typeofIs:") ||
    operator.startsWith("typeofNot:");

type PropertyOp = Extract<Operation, { kind: "property" }>;
type SetPropertyOp = Extract<Operation, { kind: "setProperty" }>;
const elementGet = (op: Operation): op is PropertyOp =>
    op.kind === "property" &&
    op.operation === "get" &&
    op.keyName === undefined &&
    !!op.numericKey;
const elementSet = (op: Operation): op is SetPropertyOp =>
    op.kind === "setProperty" &&
    !op.define &&
    op.keyName === undefined &&
    op.literalSlot === undefined &&
    op.literalElement === undefined &&
    !!op.numericKey;
const lengthGet = (op: Operation): op is PropertyOp =>
    op.kind === "property" &&
    op.operation === "get" &&
    op.keyName === "length";

function successors(block: BlockIR): number[] {
    const out = terminatorTargets(block.terminator);
    if (block.exceptionTarget !== undefined) out.push(block.exceptionTarget);
    for (const op of block.operations)
        if (op.kind === "pushHandler") out.push(op.target);
    return out;
}

/** Natural loops by header, smallest first: the header and every block that reaches a back edge's source without passing it. */
function naturalLoops(
    fn: FunctionIR,
    byId: ReadonlyMap<number, BlockIR>,
): { header: number; blocks: Set<number> }[] {
    // Reverse post-order from the entry, then the iterative dominator sets of
    // Cooper, Harvey and Kennedy.
    const order: number[] = [],
        seen = new Set<number>(),
        stack: { id: number; next: number[] }[] = [];
    const push = (id: number) => {
        seen.add(id);
        stack.push({ id, next: successors(byId.get(id)!) });
    };
    push(fn.blocks[0]!.id);
    while (stack.length) {
        const top = stack[stack.length - 1]!;
        const next = top.next.pop();
        if (next === undefined) {
            order.push(top.id);
            stack.pop();
        } else if (!seen.has(next) && byId.has(next)) push(next);
    }
    order.reverse();
    const rank = new Map(order.map((id, i) => [id, i]));
    const predecessors = new Map<number, number[]>();
    for (const id of order)
        for (const s of successors(byId.get(id)!))
            if (rank.has(s)) {
                if (!predecessors.has(s)) predecessors.set(s, []);
                predecessors.get(s)!.push(id);
            }
    const idom = new Map<number, number>([[order[0]!, order[0]!]]);
    const intersect = (x: number, y: number) => {
        while (x !== y) {
            while (rank.get(x)! > rank.get(y)!) x = idom.get(x)!;
            while (rank.get(y)! > rank.get(x)!) y = idom.get(y)!;
        }
        return x;
    };
    for (let changed = true; changed; ) {
        changed = false;
        for (const id of order.slice(1)) {
            let dom: number | undefined;
            for (const p of predecessors.get(id) ?? [])
                if (idom.has(p)) dom = dom === undefined ? p : intersect(p, dom);
            if (dom !== undefined && idom.get(id) !== dom) {
                idom.set(id, dom);
                changed = true;
            }
        }
    }
    const dominates = (d: number, n: number) => {
        for (;;) {
            if (n === d) return true;
            const up = idom.get(n);
            if (up === undefined || up === n) return false;
            n = up;
        }
    };
    const loops = new Map<number, Set<number>>();
    for (const id of order)
        for (const h of successors(byId.get(id)!)) {
            if (!rank.has(h) || !dominates(h, id)) continue;
            const blocks = loops.get(h) ?? new Set([h]);
            loops.set(h, blocks);
            const work = [id];
            while (work.length) {
                const n = work.pop()!;
                if (blocks.has(n)) continue;
                blocks.add(n);
                work.push(...(predecessors.get(n) ?? []));
            }
        }
    return [...loops]
        .map(([header, blocks]) => ({ header, blocks }))
        .sort((x, y) => x.blocks.size - y.blocks.size);
}

/** A value the loop does not change: a slot it never writes, or a script binding it never stores. */
type Source = { slot: number } | { global: number };
const sourceKey = (s: Source) =>
    "slot" in s ? "s" + s.slot : "g" + s.global;

interface Plan {
    header: number;
    blocks: Set<number>;
    induction: number;
    /** The bound is the length of receivers[0] (else `bound`). */
    lengthBound: boolean;
    bound?: Source;
    receivers: Source[];
    /** Slots and bindings that must hold primitives on entry. */
    primitives: Source[];
    unchecked: Set<Operation>;
    renamed: number[];
}

function analyzeLoop(
    fn: FunctionIR,
    byId: ReadonlyMap<number, BlockIR>,
    header: number,
    blocks: Set<number>,
    liveness: () => ReturnType<typeof analyzeLiveness>,
): Plan | undefined {
    if (header === fn.blocks[0]!.id) return undefined;
    const loop = [...blocks].map((id) => byId.get(id)!);
    for (const block of fn.blocks)
        if (block.exceptionTarget === header) return undefined;
    for (const block of loop)
        if (
            block.exceptionTarget !== undefined &&
            blocks.has(block.exceptionTarget)
        )
            return undefined;
    // Every operation of the loop is one of the whitelisted kinds.
    const defs = new Map<number, Operation[]>(),
        stored = new Map<number, number[]>();
    let elements = 0;
    for (const block of loop)
        for (const op of block.operations) {
            switch (op.kind) {
                case "constant":
                case "copy":
                case "loadGlobal":
                case "uninitialized":
                case "checkInitialized":
                    break;
                case "storeGlobal":
                    if (op.prelude) return undefined;
                    if (!stored.has(op.index)) stored.set(op.index, []);
                    stored.get(op.index)!.push(op.source);
                    break;
                case "binary":
                    if (
                        !coercing.has(op.operator) &&
                        !inspecting.has(op.operator)
                    )
                        return undefined;
                    break;
                case "unary":
                    if (
                        !unaryCoercing.has(op.operator) &&
                        !unaryInspecting(op.operator)
                    )
                        return undefined;
                    break;
                case "property":
                    if (elementGet(op)) elements++;
                    else if (!lengthGet(op)) return undefined;
                    break;
                case "setProperty":
                    if (!elementSet(op)) return undefined;
                    elements++;
                    break;
                default:
                    return undefined;
            }
            for (const d of definitions(op)) {
                if (!defs.has(d)) defs.set(d, []);
                defs.get(d)!.push(op);
            }
        }
    const head = byId.get(header)!,
        t = head.terminator;
    if (
        !elements ||
        t.kind !== "branch" ||
        !blocks.has(t.yes) ||
        blocks.has(t.no)
    )
        return undefined;
    // (Liveness is computed for the first loop that gets this far.)
    const liveIn = liveness().get(header)!.liveIn,
        floor = liveFloor(fn);
    const live = (slot: number) => isLive(liveIn, slot, floor);
    // `i < bound`, the last definition of the condition in the header, with
    // neither operand changed after it there.
    const ops = head.operations;
    let at = -1;
    for (let k = ops.length - 1; k >= 0 && at < 0; k--)
        if (definitions(ops[k]!).includes(t.condition)) at = k;
    const compare = ops[at];
    if (
        compare?.kind !== "binary" ||
        compare.operator !== "<" ||
        compare.left === compare.right
    )
        return undefined;
    const induction = compare.left,
        boundSlot = compare.right;
    if (
        ops
            .slice(at + 1)
            .some((op) =>
                definitions(op).some(
                    (d) => d === induction || d === boundSlot,
                ),
            )
    )
        return undefined;
    // i changes only by i++ (or i = i + 1).
    for (const op of defs.get(induction) ?? []) {
        const one = (slot: number) =>
            (defs.get(slot) ?? []).length === 1 &&
            defs.get(slot)![0]!.kind === "constant" &&
            (defs.get(slot)![0] as { value: unknown }).value === 1 &&
            !live(slot);
        if (
            !(
                (op.kind === "unary" &&
                    op.operator === "increment" &&
                    op.argument === induction) ||
                (op.kind === "binary" &&
                    op.operator === "+" &&
                    op.left === induction &&
                    one(op.right))
            )
        )
            return undefined;
    }
    // A value the loop does not change, as seen from a slot.
    const source = (slot: number): Source | undefined => {
        const ds = defs.get(slot);
        if (ds === undefined) return { slot };
        if (live(slot)) return undefined;
        const first = ds[0]!;
        if (
            first.kind !== "loadGlobal" ||
            first.prelude ||
            stored.has(first.index) ||
            ds.some(
                (op) => op.kind !== "loadGlobal" || op.index !== first.index,
            )
        )
            return undefined;
        return { global: first.index };
    };
    const receivers = new Map<string, Source>();
    const receiver = (slot: number): boolean => {
        const s = source(slot);
        if (s === undefined) return false;
        receivers.set(sourceKey(s), s);
        return true;
    };
    let lengthBound = false,
        bound: Source | undefined;
    const boundDefs = defs.get(boundSlot);
    if (boundDefs?.length === 1 && lengthGet(boundDefs[0]!)) {
        const length = boundDefs[0] as PropertyOp;
        if (
            !ops.slice(0, at).includes(length) ||
            live(boundSlot) ||
            !receiver(length.object)
        )
            return undefined;
        lengthBound = true;
    } else {
        bound = source(boundSlot);
        if (bound === undefined) return undefined;
    }
    const lengthReceiver = lengthBound
        ? sourceKey(source((boundDefs![0] as PropertyOp).object)!)
        : undefined;
    // Where `i < bound` holds (a forward must-analysis over the loop).
    const checkedIn = new Map<number, boolean>(loop.map((b) => [b.id, true]));
    checkedIn.set(header, false);
    const blockOut = (block: BlockIR, start: boolean): boolean => {
        let checked = start;
        for (const op of block.operations)
            if (definitions(op).includes(induction)) checked = false;
        return checked;
    };
    for (let changed = true; changed; ) {
        changed = false;
        for (const block of loop) {
            const out =
                block.id === header ? false : blockOut(block, checkedIn.get(block.id)!);
            for (const target of terminatorTargets(block.terminator)) {
                if (!blocks.has(target) || target === header) continue;
                const edge =
                    block.id === header
                        ? target === t.yes && t.yes !== t.no
                        : out;
                if (!edge && checkedIn.get(target)) {
                    checkedIn.set(target, false);
                    changed = true;
                }
            }
        }
    }
    // Element accesses and length reads; the operands that must be primitives.
    const unchecked = new Set<Operation>(),
        needed = new Set<number>();
    for (const block of loop) {
        let checked = checkedIn.get(block.id)!;
        for (const op of block.operations) {
            if (elementGet(op) || elementSet(op)) {
                if (op.key !== induction || !checked || !receiver(op.object))
                    return undefined;
                unchecked.add(op);
                if (op.kind === "setProperty") needed.add(op.source);
            } else if (lengthGet(op)) {
                if (!receiver((op as PropertyOp).object)) return undefined;
                unchecked.add(op);
            } else if (op.kind === "binary" && coercing.has(op.operator)) {
                needed.add(op.left);
                needed.add(op.right);
            } else if (op.kind === "unary" && unaryCoercing.has(op.operator))
                needed.add(op.argument);
            if (definitions(op).includes(induction)) checked = false;
        }
    }
    // Close over copies, binding loads and stores: what a needed slot can
    // come from inside the loop is needed too. Every other definition in the
    // loop yields a primitive.
    const neededGlobals = new Set<number>();
    const work = [...needed];
    while (work.length) {
        const slot = work.pop()!;
        for (const op of defs.get(slot) ?? []) {
            if (op.kind === "copy" && !needed.has(op.source)) {
                needed.add(op.source);
                work.push(op.source);
            }
            if (op.kind === "loadGlobal" && !neededGlobals.has(op.index)) {
                neededGlobals.add(op.index);
                for (const s of stored.get(op.index) ?? [])
                    if (!needed.has(s)) {
                        needed.add(s);
                        work.push(s);
                    }
            }
        }
    }
    const primitives: Source[] = [];
    for (const slot of needed)
        if (slot !== induction && (!defs.has(slot) || live(slot)))
            primitives.push({ slot });
    for (const index of neededGlobals) primitives.push({ global: index });
    // A receiver that must also be a primitive would always fail the guard.
    const primitiveKeys = new Set(primitives.map(sourceKey));
    if ([...receivers.keys()].some((k) => primitiveKeys.has(k)))
        return undefined;
    // The receiver of `bound = a.length` goes first.
    const ordered = [...receivers.values()].sort(
        (x, y) =>
            Number(sourceKey(y) === lengthReceiver) -
            Number(sourceKey(x) === lengthReceiver),
    );
    if (3 + ordered.length + primitives.length > maxGuardArguments)
        return undefined;
    // Temporaries defined and read only inside the loop and not live into
    // its header get their own slots in the copy.
    const inside = new Set<number>(),
        outside = new Set<number>();
    for (const block of fn.blocks) {
        const into = blocks.has(block.id) ? inside : outside;
        for (const op of block.operations)
            for (const n of [...definitions(op), ...operationUses(op)])
                into.add(n);
        const use = terminatorUse(block.terminator);
        if (use >= 0) into.add(use);
    }
    const renamed = [...inside].filter(
        (n) => n >= fn.localCount && !outside.has(n) && !live(n),
    );
    return {
        header,
        blocks,
        induction,
        lengthBound,
        bound,
        receivers: ordered,
        primitives,
        unchecked,
        renamed,
    };
}

/** A whitelisted operation with its slots renamed. */
function renameOperation(op: Operation, r: (n: number) => number): Operation {
    switch (op.kind) {
        case "constant":
        case "loadGlobal":
        case "uninitialized":
            return { ...op, dest: r(op.dest) };
        case "copy":
            return { ...op, dest: r(op.dest), source: r(op.source) };
        case "storeGlobal":
            return { ...op, source: r(op.source) };
        case "checkInitialized":
            return { ...op, slot: r(op.slot) };
        case "binary":
            return {
                ...op,
                dest: r(op.dest),
                left: r(op.left),
                right: r(op.right),
            };
        case "unary":
            return { ...op, dest: r(op.dest), argument: r(op.argument) };
        case "property":
            return {
                ...op,
                dest: r(op.dest),
                object: r(op.object),
                key: r(op.key),
            };
        case "setProperty":
            return {
                ...op,
                object: r(op.object),
                key: r(op.key),
                source: r(op.source),
            };
        default:
            throw new Error("typed-loops: unexpected operation " + op.kind);
    }
}
function retarget(t: Terminator, m: (id: number) => number): Terminator {
    switch (t.kind) {
        case "jump":
            return { ...t, target: m(t.target) };
        case "branch":
            return { ...t, yes: m(t.yes), no: m(t.no) };
        case "switch":
            return { ...t, targets: t.targets.map(m), otherwise: m(t.otherwise) };
        default:
            return t;
    }
}

/** The guarded copy of a loop and its guard block, in front of the header. */
function version(fn: FunctionIR, plan: Plan): FunctionIR {
    let slotCount = fn.slotCount,
        nextBlock = Math.max(...fn.blocks.map((b) => b.id)) + 1;
    const slotMap = new Map(plan.renamed.map((n) => [n, slotCount++]));
    const blockMap = new Map(
        [...plan.blocks].map((id) => [id, nextBlock++] as const),
    );
    const guard = nextBlock++;
    const renameSlot = (n: number) => slotMap.get(n) ?? n;
    const cloneTarget = (id: number) => blockMap.get(id) ?? id;
    const clones: BlockIR[] = [];
    for (const block of fn.blocks) {
        if (!plan.blocks.has(block.id)) continue;
        const t = block.terminator;
        clones.push({
            id: blockMap.get(block.id)!,
            ...(block.exceptionTarget !== undefined
                ? { exceptionTarget: block.exceptionTarget }
                : {}),
            operations: block.operations.map((op) => {
                const renamed = renameOperation(op, renameSlot);
                if (!plan.unchecked.has(op)) return renamed;
                return lengthGet(op)
                    ? ({ ...renamed, typedLength: true } as Operation)
                    : ({ ...renamed, unchecked: true } as Operation);
            }),
            terminator: retarget(
                t.kind === "branch"
                    ? { ...t, condition: renameSlot(t.condition) }
                    : t.kind === "switch"
                      ? { ...t, value: renameSlot(t.value) }
                      : t,
                cloneTarget,
            ),
        });
    }
    // The guard: rt.typedLoopGuard(header, start, bound, receivers...,
    // primitives...), header = 16 * receivers + (bound is receivers[0].length).
    const operations: Operation[] = [],
        materialize = (s: Source): number => {
            if ("slot" in s) return s.slot;
            const dest = slotCount++;
            operations.push({ kind: "loadGlobal", dest, index: s.global });
            return dest;
        };
    const header = slotCount++;
    operations.push({
        kind: "constant",
        dest: header,
        value: 16 * plan.receivers.length + (plan.lengthBound ? 1 : 0),
    });
    const receivers = plan.receivers.map(materialize);
    const args = [
        header,
        plan.induction,
        plan.lengthBound ? receivers[0]! : materialize(plan.bound!),
        ...receivers,
        ...plan.primitives.map(materialize),
    ];
    const passed = slotCount++;
    operations.push({
        kind: "call",
        dest: passed,
        target: "rt.typedLoopGuard",
        arguments: args,
    });
    const guardBlock: BlockIR = {
        id: guard,
        operations,
        terminator: {
            kind: "branch",
            condition: passed,
            yes: blockMap.get(plan.header)!,
            no: plan.header,
        },
    };
    const entry = (id: number) => (id === plan.header ? guard : id);
    const blocks: BlockIR[] = [];
    for (const block of fn.blocks) {
        if (block.id === plan.header) blocks.push(guardBlock, ...clones);
        blocks.push(
            plan.blocks.has(block.id)
                ? block
                : { ...block, terminator: retarget(block.terminator, entry) },
        );
    }
    return {
        ...fn,
        slotCount,
        maxArguments: Math.max(fn.maxArguments, args.length),
        blocks,
    };
}

/** Versions the qualifying typed array loops of fn (see above). */
export function versionTypedLoops(fn: FunctionIR): FunctionIR {
    // Prelude code works on ordinary arrays (as in element-sites.ts).
    if (fn.id.startsWith("js.regexpVm.") || fn.generator) return fn;
    if (process.env.NONA_NO_BCE) return fn; // TEMP
    if (
        !fn.blocks.some((block) =>
            block.operations.some((op) => elementGet(op) || elementSet(op)),
        )
    )
        return fn;
    const tried = new Set<number>();
    for (let round = 0; round < maxLoops; round++) {
        const byId = new Map(fn.blocks.map((b) => [b.id, b]));
        let computed: ReturnType<typeof analyzeLiveness> | undefined;
        const liveness = () => (computed ??= analyzeLiveness(fn));
        let plan: Plan | undefined;
        for (const { header, blocks } of naturalLoops(fn, byId)) {
            if (tried.has(header)) continue;
            tried.add(header);
            plan = analyzeLoop(fn, byId, header, blocks, liveness);
            if (plan) break;
        }
        if (!plan) break;
        const before = new Set(fn.blocks.map((b) => b.id));
        fn = version(fn, plan);
        // The copy's blocks are not versioned again.
        for (const b of fn.blocks) if (!before.has(b.id)) tried.add(b.id);
    }
    return fn;
}
