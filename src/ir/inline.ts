import type {
    BlockIR,
    FunctionIR,
    ModuleIR,
    Operation,
    Terminator,
} from "./model.js";
import { optimizeFunction } from "./optimize.js";

/**
 * Guarded inlining of small known callees (#235, #146 items 4, 5 and 20).
 * A direct call (src/ir/calls.ts) of a small plain function is replaced by
 * a copy of the callee's body behind the test the direct call makes:
 *
 *     g = isFunctionCode callee, js.fn.N
 *     branch g ? inlined body : invoke callee (the original call)
 *
 * and both paths continue in a join block. The caller is then optimized
 * again, so constant folding, branch elimination and copy propagation see
 * through the call: `square(12)` writes the constant 144 on the inlined path.
 *
 * - The body gets fresh slots (callee slot s is caller slot base + s) and
 *   fresh blocks, which inherit the call block's exception target: a throw
 *   in the body reaches the caller's handler exactly as the call's would.
 * - The arguments are already evaluated slots: parameter i is copied from
 *   argument i, or is undefined when it is missing; extra arguments are
 *   ignored. The declared locals start as undefined (a frame clears them).
 * - `this` is the global object for sloppy callees and undefined for strict
 *   ones (a call without receiver); the running function is the callee,
 *   which the guard proved. `return v` copies v into the call's destination
 *   and jumps to the join block; a tail call in the body becomes an ordinary
 *   call (the caller's frame replaces the callee's).
 * - The function object is still created and called anywhere else: only the
 *   call is replaced, so its identity, name, length and source are unchanged.
 *
 * A callee is inlined when it is a plain function of the program (js.fn.*,
 * not a generator, derived constructor or arrow; calls.ts annotates only
 * plain functions), at most maxInlineCalleeSize operations and terminators,
 * has no exception handler, does not call itself, and uses only the
 * operations of `allowed` (no closures, captures, arguments object,
 * new.target, super or coroutine operations). Only calls without receiver,
 * construction or tail position are replaced. Callees are inlined with
 * their bodies before inlining, so an inlined body is not inlined into
 * again (depth 1); each caller and the module have growth budgets.
 */

/** Largest callee inlined: operations plus terminators of its optimized IR. */
export const maxInlineCalleeSize = 30;
/** Most operations inlining may add to one caller. */
export const maxInlineCallerGrowth = 600;
/** Callers larger than this (operations plus terminators) are left alone: re-optimizing them costs compile time. */
export const maxInlineCallerSize = 20000;
/** Most operations inlining may add to a module: this fraction of its size, but at least minInlineModuleBudget. */
export const maxInlineModuleGrowth = 0.25;
export const minInlineModuleBudget = 2000;
/** Calls inside an inlined body are not inlined again. */
export const inlineDepthLimit = 1;

export interface InlineOptions {
    /** Initialized captures by function (initialization.ts), for optimizeFunction. */
    captures?: ReadonlyMap<string, ReadonlySet<number>>;
}

const allowed = new Set<Operation["kind"]>([
    "constant",
    "copy",
    "unary",
    "binary",
    "property",
    "setProperty",
    "invoke",
    "invokeArray",
    "call",
    "loadGlobal",
    "storeGlobal",
    "readGlobalProperty",
    "globalObject",
    "currentThis",
    "currentFunction",
    "uninitialized",
    "checkInitialized",
    "checkResolvable",
    "immutableWrite",
    "nullishDestructure",
    "newObject",
    "requireObject",
    "requireIterable",
    "getIterator",
    "iteratorStep",
    "iteratorClose",
    "forOfValue",
    "forInKeys",
    "forInHas",
]);

/** Operations plus terminators. */
export function functionSize(fn: FunctionIR): number {
    let n = 0;
    for (const block of fn.blocks) n += block.operations.length + 1;
    return n;
}

/** How the body of an inlined callee reads its frame. */
interface Frame {
    slot: (n: number) => number;
    /** The callee (the guard proved it is the function running the body). */
    callee: number;
    strict: boolean;
}

/** An operation of the callee rewritten into the caller (undefined: not inlinable). */
function remap(op: Operation, f: Frame): Operation | undefined {
    if (!allowed.has(op.kind)) return undefined;
    const s = f.slot;
    switch (op.kind) {
        case "constant":
        case "loadGlobal":
        case "readGlobalProperty":
        case "globalObject":
        case "uninitialized":
            return { ...op, dest: s(op.dest) };
        case "newObject":
            return {
                ...op,
                dest: s(op.dest),
                ...(op.literal
                    ? {
                          literal: {
                              ...op.literal,
                              keys: op.literal.keys.map(s),
                              values: op.literal.values.map(s),
                          },
                      }
                    : {}),
                ...(op.elementValues
                    ? { elementValues: op.elementValues.map(s) }
                    : {}),
            };
        case "copy":
            return { ...op, dest: s(op.dest), source: s(op.source) };
        case "unary":
            return { ...op, dest: s(op.dest), argument: s(op.argument) };
        case "binary":
            return {
                ...op,
                dest: s(op.dest),
                left: s(op.left),
                right: s(op.right),
            };
        case "property":
            return {
                ...op,
                dest: s(op.dest),
                object: s(op.object),
                key: s(op.key),
            };
        case "setProperty":
            return {
                ...op,
                object: s(op.object),
                key: s(op.key),
                source: s(op.source),
            };
        case "invoke": {
            const { tail, ...rest } = op;
            void tail;
            return {
                ...rest,
                dest: s(op.dest),
                callee: s(op.callee),
                arguments: op.arguments.map(s),
                ...(op.receiver !== undefined
                    ? { receiver: s(op.receiver) }
                    : {}),
                ...(op.newTarget !== undefined
                    ? { newTarget: s(op.newTarget) }
                    : {}),
            };
        }
        case "invokeArray":
            return {
                ...op,
                dest: s(op.dest),
                callee: s(op.callee),
                array: s(op.array),
                ...(op.receiver !== undefined
                    ? { receiver: s(op.receiver) }
                    : {}),
                ...(op.newTarget !== undefined
                    ? { newTarget: s(op.newTarget) }
                    : {}),
            };
        case "call":
            return {
                ...op,
                dest: s(op.dest),
                arguments: op.arguments.map(s),
            };
        case "storeGlobal":
        case "requireObject":
            return { ...op, source: s(op.source) };
        case "nullishDestructure":
            return {
                ...op,
                source: s(op.source),
                key: op.key === undefined ? undefined : s(op.key),
            };
        case "currentThis":
            return f.strict
                ? { kind: "constant", dest: s(op.dest), value: undefined }
                : { kind: "globalObject", dest: s(op.dest) };
        case "currentFunction":
            return { kind: "copy", dest: s(op.dest), source: f.callee };
        case "checkInitialized":
        case "checkResolvable":
            return { ...op, slot: s(op.slot) };
        case "immutableWrite":
            return op;
        case "requireIterable":
            return { ...op, object: s(op.object) };
        case "getIterator":
            return {
                ...op,
                iterator: s(op.iterator),
                next: s(op.next),
                object: s(op.object),
            };
        case "iteratorStep":
            return {
                ...op,
                dest: s(op.dest),
                done: s(op.done),
                iterator: s(op.iterator),
                next: s(op.next),
            };
        case "iteratorClose":
            return { ...op, iterator: s(op.iterator) };
        case "forOfValue":
            return {
                ...op,
                dest: s(op.dest),
                iterable: s(op.iterable),
                index: s(op.index),
            };
        case "forInKeys":
            return { ...op, dest: s(op.dest), object: s(op.object) };
        case "forInHas":
            return {
                ...op,
                dest: s(op.dest),
                object: s(op.object),
                key: s(op.key),
            };
        default:
            return undefined;
    }
}

/** Whether fn may be inlined at a direct call. */
function inlinable(fn: FunctionIR): boolean {
    if (
        !fn.id.startsWith("js.fn.") ||
        fn.generator ||
        fn.derivedConstructor ||
        (fn.handlerCount ?? 0) > 0 ||
        functionSize(fn) > maxInlineCalleeSize
    )
        return false;
    const probe: Frame = { slot: (n) => n, callee: 0, strict: true };
    return fn.blocks.every(
        (block) =>
            block.exceptionTarget === undefined &&
            block.operations.every(
                (op) =>
                    remap(op, probe) !== undefined &&
                    !(op.kind === "invoke" && op.direct === fn.id),
            ),
    );
}

type Site = Extract<Operation, { kind: "invoke" }>;

/** The callee a call may be replaced by. */
function siteCallee(
    op: Operation,
    caller: FunctionIR,
    callees: ReadonlyMap<string, FunctionIR>,
): FunctionIR | undefined {
    if (
        op.kind !== "invoke" ||
        op.direct === undefined ||
        op.direct === caller.id ||
        op.construct ||
        op.tail ||
        op.newTarget !== undefined ||
        op.receiver !== undefined ||
        op.hasOwn !== undefined
    )
        return undefined;
    return callees.get(op.direct);
}

/** Operations a site adds to its caller. */
const growthOf = (callee: FunctionIR) =>
    functionSize(callee) + callee.localCount + 4;

function inlineInto(
    caller: FunctionIR,
    callees: ReadonlyMap<string, FunctionIR>,
    budget: { left: number },
): FunctionIR | undefined {
    let nextBlock = 1 + Math.max(...caller.blocks.map((block) => block.id)),
        slotCount = caller.slotCount,
        maxArguments = caller.maxArguments,
        callerLeft = maxInlineCallerGrowth,
        inlined = false;
    const fresh = () => slotCount++;
    const blocks: BlockIR[] = [],
        cold: BlockIR[] = [];
    for (const original of caller.blocks) {
        let block = original;
        for (;;) {
            let index = -1,
                callee: FunctionIR | undefined;
            for (const [i, op] of block.operations.entries()) {
                const candidate = siteCallee(op, caller, callees);
                if (
                    candidate &&
                    growthOf(candidate) <= callerLeft &&
                    growthOf(candidate) <= budget.left
                ) {
                    index = i;
                    callee = candidate;
                    break;
                }
            }
            if (!callee) {
                blocks.push(block);
                break;
            }
            const growth = growthOf(callee);
            callerLeft -= growth;
            budget.left -= growth;
            inlined = true;
            const site = block.operations[index] as Site,
                handler =
                    block.exceptionTarget === undefined
                        ? {}
                        : { exceptionTarget: block.exceptionTarget };
            const base = slotCount;
            slotCount += callee.slotCount;
            maxArguments = Math.max(maxArguments, callee.maxArguments);
            const frame: Frame = {
                slot: (n) => base + n,
                callee: site.callee,
                strict: !!site.directStrict,
            };
            const ids = new Map(
                callee.blocks.map((b) => [b.id, nextBlock++] as const),
            );
            const entry = nextBlock++,
                fallback = nextBlock++,
                join = nextBlock++,
                guard = fresh();
            blocks.push({
                ...block,
                operations: [
                    ...block.operations.slice(0, index),
                    {
                        kind: "isFunctionCode",
                        dest: guard,
                        callee: site.callee,
                        target: site.direct!,
                    },
                ],
                terminator: {
                    kind: "branch",
                    condition: guard,
                    yes: entry,
                    no: fallback,
                },
            });
            // Parameters from the arguments, declared locals undefined.
            const prologue: Operation[] = [];
            for (
                let p = 0;
                p < Math.max(callee.localCount, callee.parameterCount);
                p++
            )
                prologue.push(
                    p < callee.parameterCount && p < site.arguments.length
                        ? {
                              kind: "copy",
                              dest: frame.slot(p),
                              source: site.arguments[p]!,
                          }
                        : {
                              kind: "constant",
                              dest: frame.slot(p),
                              value: undefined,
                          },
                );
            blocks.push({
                id: entry,
                ...handler,
                operations: prologue,
                terminator: {
                    kind: "jump",
                    target: ids.get(callee.blocks[0]!.id)!,
                },
            });
            for (const b of callee.blocks) {
                const operations = b.operations.map((op) => remap(op, frame)!);
                const t = b.terminator;
                let terminator: Terminator;
                switch (t.kind) {
                    case "return":
                        operations.push(
                            t.value >= 0
                                ? {
                                      kind: "copy",
                                      dest: site.dest,
                                      source: frame.slot(t.value),
                                  }
                                : {
                                      kind: "constant",
                                      dest: site.dest,
                                      value: undefined,
                                  },
                        );
                        terminator = { kind: "jump", target: join };
                        break;
                    case "throw":
                        terminator = {
                            kind: "throw",
                            value: frame.slot(t.value),
                        };
                        break;
                    case "jump":
                        terminator = {
                            kind: "jump",
                            target: ids.get(t.target)!,
                        };
                        break;
                    case "branch":
                        terminator = {
                            kind: "branch",
                            condition: frame.slot(t.condition),
                            yes: ids.get(t.yes)!,
                            no: ids.get(t.no)!,
                        };
                        break;
                    case "switch":
                        terminator = {
                            ...t,
                            value: frame.slot(t.value),
                            targets: t.targets.map((target) =>
                                ids.get(target)!,
                            ),
                            otherwise: ids.get(t.otherwise)!,
                        };
                        break;
                }
                blocks.push({
                    id: ids.get(b.id)!,
                    ...handler,
                    operations,
                    terminator,
                });
            }
            cold.push({
                id: fallback,
                ...handler,
                operations: [site],
                terminator: { kind: "jump", target: join },
            });
            block = {
                ...block,
                id: join,
                operations: block.operations.slice(index + 1),
            };
        }
    }
    if (!inlined) return undefined;
    return {
        ...caller,
        slotCount,
        maxArguments,
        blocks: [...blocks, ...cold],
    };
}

/**
 * Inlines the small known callees of a module's direct calls (see above);
 * every caller that changed is optimized again.
 */
export function inlineDirectCalls(
    module: ModuleIR,
    options: InlineOptions = {},
): ModuleIR {
    const callees = new Map<string, FunctionIR>();
    let total = 0;
    for (const fn of module.functions) {
        total += functionSize(fn);
        if (inlinable(fn)) callees.set(fn.id, fn);
    }
    if (!callees.size) return module;
    const budget = {
        left: Math.max(minInlineModuleBudget, total * maxInlineModuleGrowth),
    };
    let changed = false;
    const functions = module.functions.map((fn) => {
        if (budget.left <= 0 || functionSize(fn) > maxInlineCallerSize)
            return fn;
        const inlined = inlineInto(fn, callees, budget);
        if (!inlined) return fn;
        changed = true;
        return optimizeFunction(inlined, options.captures);
    });
    return changed ? { ...module, functions } : module;
}
