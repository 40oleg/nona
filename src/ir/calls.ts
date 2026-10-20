import type { FunctionIR, ModuleIR, Operation, Terminator } from "./model.js";
import { cacheableName } from "../shape-limits.js";
import { operationUses } from "./liveness.js";
import { destinations } from "./locations.js";

/**
 * Direct calls (roadmap item 16): a call whose callee is a function
 * declaration known at compile time is annotated with the declaration's code
 * label. The code generator then checks that the callee really is a function
 * running that code (a global can be reassigned at any time, so the check is
 * made on every call) and calls the code directly, skipping rt.invoke's
 * general dispatch; any other callee takes the usual path.
 *
 * A callee is known when it is the result of `newFunction` in the same
 * block, or a read of a global binding that every store in the program
 * fills with the same function declaration. Generators, async functions and
 * class constructors are never annotated, nor arrow functions that read their
 * lexical this or new.target.
 *
 * A callee that reads neither this nor new.target (usesFrameThis) is called
 * without a receiver, and a call that passes exactly its parameters enters
 * after the argument count handling (`<id>.direct`, emitDirectEntry in
 * src/runtime/prologue.ts). The check of the callee stays even where the
 * binding cannot change: it is a few well-predicted instructions and
 * measured no cost against the call.
 */
type Target = {
    target: string;
    strict: boolean;
    noThis: boolean;
    /** The parameter count, when the function is in this module. */
    parameters?: number;
};

/** Operations that read or write the frame's this, new.target or super receiver slots. */
const frameThisOperations = new Set<Operation["kind"]>([
    "currentThis",
    "setCurrentThis",
    "newTarget",
    "superReceiver",
    "derivedReturn",
]);
/**
 * Whether a function's code uses the this, new.target or super receiver
 * slots of its frame: through the operations above, or by creating an arrow
 * function (which copies them as its lexical this and new.target). A
 * function that does not gets the lean prologue (src/runtime/prologue.ts),
 * and a direct call to it passes no receiver.
 */
export function usesFrameThis(fn: FunctionIR): boolean {
    if (fn.derivedConstructor || fn.generator) return true;
    for (const block of fn.blocks)
        for (const op of block.operations)
            if (
                frameThisOperations.has(op.kind) ||
                (op.kind === "newFunction" && op.arrow)
            )
                return true;
    return false;
}

export function annotateDirectCalls(module: ModuleIR): ModuleIR {
    return annotateMethodCalls(annotateKnownCallees(module));
}

function annotateKnownCallees(module: ModuleIR): ModuleIR {
    const callable = new Map<string, Target | null>(),
        byId = new Map(module.functions.map((fn) => [fn.id, fn]));
    // Slots that hold a function declaration's closure (or, as "", the
    // uninitialized marker of a binding in its TDZ) at each operation.
    const definitions = (
        fn: FunctionIR,
        visit: (op: Operation, fromFunction: Map<number, string>) => void,
    ) => {
        for (const block of fn.blocks) {
            const fromFunction = new Map<number, string>();
            for (const op of block.operations) {
                visit(op, fromFunction);
                if ("dest" in op) fromFunction.delete(op.dest);
                if (op.kind === "newFunction")
                    fromFunction.set(op.dest, op.target);
                else if (op.kind === "uninitialized")
                    fromFunction.set(op.dest, "");
                else if (op.kind === "copy" && fromFunction.has(op.source))
                    fromFunction.set(op.dest, fromFunction.get(op.source)!);
            }
        }
    };
    for (const fn of module.functions)
        for (const block of fn.blocks)
            for (const op of block.operations)
                if (op.kind === "newFunction") {
                    const callee = byId.get(op.target),
                        noThis = callee !== undefined && !usesFrameThis(callee),
                        plain =
                            (!op.arrow || noThis) &&
                            !op.generator &&
                            !op.async &&
                            !op.classConstructor;
                    callable.set(
                        op.target,
                        plain
                            ? {
                                  target: op.target,
                                  strict: !!op.strict,
                                  noThis,
                                  parameters: callee?.parameterCount,
                              }
                            : null,
                    );
                }
    // Global index -> the one declaration every store puts there (null:
    // anything else). Storing the TDZ marker (`const f = () => ...` at the
    // top level) does not count: a call in the TDZ fails the callee check
    // and throws on the general path.
    const globals = new Map<number, string | null>();
    for (const fn of module.functions)
        definitions(fn, (op, fromFunction) => {
            if (op.kind !== "storeGlobal" || op.prelude) return;
            if (fromFunction.get(op.source) === "") return;
            const target = fromFunction.get(op.source) ?? null,
                known = globals.get(op.index);
            globals.set(
                op.index,
                known === undefined ? target : known === target ? known : null,
            );
        });
    let changed = false;
    // Functions entered at `<id>.direct` by a call that passes exactly their parameters.
    const entered = new Set<string>();
    const functions = module.functions.map((fn) => {
        let marked = false;
        const blocks = fn.blocks.map((block) => {
            const known = new Map<number, string>();
            let blockChanged = false;
            const operations = block.operations.map((op) => {
                let result = op;
                if (
                    op.kind === "invoke" &&
                    !op.construct &&
                    !op.tail &&
                    op.newTarget === undefined
                ) {
                    const target = known.get(op.callee),
                        info =
                            target === undefined
                                ? undefined
                                : callable.get(target);
                    if (info) {
                        const exact = info.parameters === op.arguments.length;
                        result = {
                            ...op,
                            direct: info.target,
                            directStrict: info.strict,
                            ...(info.noThis ? { directNoThis: true } : {}),
                            ...(exact ? { directEntry: true } : {}),
                        };
                        if (exact) entered.add(info.target);
                        blockChanged = true;
                    }
                }
                if ("dest" in op) known.delete(op.dest);
                if (op.kind === "newFunction") known.set(op.dest, op.target);
                else if (op.kind === "loadGlobal" && !op.prelude) {
                    const target = globals.get(op.index);
                    if (target) known.set(op.dest, target);
                } else if (op.kind === "copy" && known.has(op.source))
                    known.set(op.dest, known.get(op.source)!);
                return result;
            });
            if (!blockChanged) return block;
            marked = true;
            return { ...block, operations };
        });
        if (!marked) return fn;
        changed = true;
        return { ...fn, blocks };
    });
    if (!changed) return module;
    return {
        ...module,
        functions: functions.map((fn) =>
            entered.has(fn.id) ? { ...fn, directEntry: true } : fn,
        ),
    };
}

/**
 * Method calls (#47): `object.name(...)` is a cached read of `name` whose
 * result is the callee of an invoke with `object` as the receiver. Both are
 * flagged `method`: the read gets a cache record with entries for several
 * receiver shapes (MethodCacheLayout, rt.icMethod) and the invoke calls a
 * plain function's code directly. The flags are hints: the invoke checks the
 * callee it gets, so a pairing that a later write breaks only costs speed.
 * Construct, tail, direct and hasOwnProperty calls keep their own paths.
 * `f.call(...)` and `f.apply(thisArg, list)` are flagged `callApply` instead:
 * the invoke checks that the callee is the builtin and calls `f` itself.
 */
function annotateMethodCalls(module: ModuleIR): ModuleIR {
    let changed = false;
    const functions = module.functions.map((fn) => {
        let marked = false;
        const blocks = fn.blocks.map((block) => {
            // dest of a cacheable read -> [its index, its object, its name]
            const reads = new Map<number, [number, number, string]>(),
                flagged = new Set<number>(),
                callApply = new Map<number, "call" | "apply">();
            block.operations.forEach((op, index) => {
                if (
                    op.kind === "invoke" &&
                    op.receiver !== undefined &&
                    !op.construct &&
                    !op.tail &&
                    !op.direct
                ) {
                    const read = reads.get(op.callee);
                    if (read && read[1] === op.receiver) {
                        const name = read[2];
                        if (
                            name === "call" ||
                            (name === "apply" && op.arguments.length === 2)
                        )
                            callApply.set(index, name);
                        else if (!op.hasOwn) {
                            flagged.add(read[0]);
                            flagged.add(index);
                        }
                    }
                }
                if ("dest" in op)
                    for (const [dest, [, object]] of reads)
                        if (dest === op.dest || object === op.dest)
                            reads.delete(dest);
                if (
                    op.kind === "property" &&
                    op.operation === "get" &&
                    op.keyName !== undefined &&
                    cacheableName(op.keyName) &&
                    op.dest !== op.object
                )
                    reads.set(op.dest, [index, op.object, op.keyName]);
            });
            if (!flagged.size && !callApply.size) return block;
            marked = true;
            return {
                ...block,
                operations: block.operations.map((op, index) =>
                    flagged.has(index)
                        ? { ...op, method: true }
                        : callApply.has(index)
                          ? { ...op, callApply: callApply.get(index) }
                          : op,
                ),
            };
        });
        if (!marked) return fn;
        changed = true;
        return elideApplyLiterals({ ...fn, blocks });
    });
    return changed ? { ...module, functions } : module;
}

/** Array literals of at most this many elements are passed to `apply` without being created. */
export const applyLiteralElements = 16;

function terminatorUses(t: Terminator): number[] {
    switch (t.kind) {
        case "branch":
            return [t.condition];
        case "switch":
        case "throw":
        case "return":
            return [t.value];
        default:
            return [];
    }
}

/**
 * `f.apply(thisArg, [a, b])`: an array literal (no holes, no spread) that is
 * used only as the list of an `apply` site in the same block is not created
 * when the call goes to %Function.prototype.apply%. Its definitions are
 * dropped and the invoke takes the elements as `arguments[1..]`
 * (`callApply: "applyElements"`); the general path builds the array
 * (rt.applyElements) right before the call, which no program can tell
 * apart: element expressions are still evaluated in order and only the
 * allocation moves. Each element must still hold its value at the call.
 */
function elideApplyLiterals(fn: FunctionIR): FunctionIR {
    const uses = new Map<number, number>();
    const count = (slot: number) => uses.set(slot, (uses.get(slot) ?? 0) + 1);
    for (const block of fn.blocks) {
        for (const op of block.operations) {
            operationUses(op).forEach(count);
            destinations(op).forEach(count);
        }
        terminatorUses(block.terminator).forEach(count);
    }
    let maxArguments = fn.maxArguments,
        changed = false;
    const blocks = fn.blocks.map((block) => {
        const ops = block.operations,
            dropped = new Set<number>(),
            rewritten = new Map<number, Operation>();
        ops.forEach((op, index) => {
            if (op.kind !== "invoke" || op.callApply !== "apply") return;
            const list = op.arguments[1]!;
            const start = ops.findIndex(
                (o, i) =>
                    i < index &&
                    o.kind === "newObject" &&
                    o.dest === list &&
                    o.array &&
                    o.elements === true,
            );
            if (start < 0) return;
            const literal = ops[start] as Extract<
                Operation,
                { kind: "newObject" }
            >;
            const n = literal.length;
            if (n > applyLiteralElements) return;
            // The literal's slot: its creation, one definition per element and the call.
            if (uses.get(list) !== n + 2) return;
            const sources: number[] = [];
            const definitions: number[] = [];
            for (let i = start + 1; i < index; i++) {
                const o = ops[i]!;
                if (
                    o.kind === "setProperty" &&
                    o.object === list &&
                    o.define &&
                    o.literalElement !== undefined
                ) {
                    sources[o.literalElement] = o.source;
                    definitions.push(i);
                }
            }
            if (definitions.length !== n) return;
            for (let e = 0; e < n; e++) {
                const source = sources[e];
                if (source === undefined || source === list) return;
                // Nothing between the definition and the call writes the element's slot.
                const at = definitions.find(
                    (i) =>
                        (ops[i] as { literalElement?: number })
                            .literalElement === e,
                )!;
                for (let i = at + 1; i < index; i++)
                    if (destinations(ops[i]!).includes(source)) return;
            }
            dropped.add(start);
            definitions.forEach((i) => dropped.add(i));
            rewritten.set(index, {
                ...op,
                arguments: [op.arguments[0]!, ...(sources as number[])],
                callApply: "applyElements",
            });
            // The general path passes callee, receiver, thisArg and the elements in the argument area.
            maxArguments = Math.max(maxArguments, n + 3);
        });
        if (!dropped.size) return block;
        changed = true;
        return {
            ...block,
            operations: ops
                .map((op, index) => rewritten.get(index) ?? op)
                .filter((_, index) => !dropped.has(index)),
        };
    });
    return changed ? { ...fn, blocks, maxArguments } : fn;
}
