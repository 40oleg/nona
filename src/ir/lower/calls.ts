import type * as A from "../../frontend/ast.js";
import { CompileError } from "../../diagnostics.js";
import { checkFfiNames, parseFfiSignature } from "../../ffi.js";
import { ClassLowerer } from "./classes.js";
import type { ChainState } from "./base.js";

/** Calls, arguments, tail calls, the FFI and prelude intrinsics, and optional chains. */
export abstract class CallLowerer extends ClassLowerer {
    protected lowerArguments(
        args: A.Argument[],
    ): { fixed: number[] } | { array: number } {
        if (!args.some((arg) => arg.kind === "SpreadElement"))
            return {
                fixed: args.map((arg) => this.expression(arg as A.Expression)),
            };
        return {
            array: this.expression({
                kind: "ArrayLiteral",
                elements: args,
                span: { start: 0, end: 0 },
            }),
        };
    }
    /** Calls in tail position of a return (ES2020 14.9 IsInTailPosition), strict code only. */
    protected collectTailCalls(e: A.Expression): void {
        if (
            (e.kind === "Call" &&
                e.callee.kind !== "Super" &&
                !e.arguments.some((arg) => arg.kind === "SpreadElement")) ||
            (e.kind === "TaggedTemplate" && e.tag.kind !== "OptionalChain")
        )
            this.tailCalls.add(e);
        else if (e.kind === "Conditional") {
            this.collectTailCalls(e.consequent);
            this.collectTailCalls(e.alternate);
        } else if (
            e.kind === "Binary" &&
            [",", "&&", "||", "??"].includes(e.operator)
        )
            this.collectTailCalls(e.right);
    }
    protected tailPosition(): boolean {
        const d = this.fn?.declaration;
        return (
            !!this.fn &&
            this.fn.strict &&
            !!d &&
            !d.generator &&
            !d.async &&
            !(
                d.kind === "FunctionExpression" &&
                (d.classConstructor || d.derivedConstructor)
            ) &&
            this.handlers.length === 0 &&
            this.finalizers.length === 0 &&
            !this.controls.some((c) => c.iterator !== undefined)
        );
    }
    protected invokeWithArguments(
        dest: number,
        callee: number,
        args: { fixed: number[] } | { array: number },
        receiver?: number,
        construct = false,
        newTarget?: number,
        tail = false,
        hasOwn?: "method" | "call",
    ): void {
        if ("array" in args)
            this.emit({
                kind: "invokeArray",
                dest,
                callee,
                array: args.array,
                ...(receiver === undefined ? {} : { receiver }),
                construct,
                ...(newTarget === undefined ? {} : { newTarget }),
            });
        else {
            this.maxArguments = Math.max(this.maxArguments, args.fixed.length);
            this.emit({
                kind: "invoke",
                dest,
                callee,
                arguments: args.fixed,
                ...(receiver === undefined ? {} : { receiver }),
                construct,
                ...(newTarget === undefined ? {} : { newTarget }),
                ...(tail ? { tail: true } : {}),
                ...(hasOwn ? { hasOwn } : {}),
            });
        }
    }
    /** `x.hasOwnProperty(key)` or `y.call(x, key)` (with `y` possibly hasOwnProperty): the call may be answered by a cache (has-cache.ts). */
    protected hasOwnCall(
        callee: A.Member,
        args: { fixed: number[] } | { array: number },
    ): "method" | "call" | undefined {
        if (
            !("fixed" in args) ||
            callee.property.kind !== "Literal" ||
            callee.object.kind === "Super"
        )
            return undefined;
        if (
            callee.property.value === "hasOwnProperty" &&
            args.fixed.length >= 1
        )
            return "method";
        if (callee.property.value === "call" && args.fixed.length >= 2)
            return "call";
        return undefined;
    }
    protected arrayOf(values: number[]): number {
        const array = this.slot();
        this.emit({
            kind: "newObject",
            dest: array,
            array: true,
            length: values.length,
        });
        values.forEach((value, index) =>
            this.emit({
                kind: "setProperty",
                strict: true,
                object: array,
                key: this.constant(index),
                source: value,
                define: true,
            }),
        );
        return array;
    }
    /** define(dll, name, signature) from nona:ffi: a static import and a native thunk. */
    protected ffiDefine(e: A.Call): number {
        const fail = (message: string, node: A.Node = e): never => {
            throw new CompileError([
                { code: "E_FFI_STATIC", message, file: "", span: node.span },
            ]);
        };
        if (e.arguments.length !== 3)
            fail(
                "define() expects exactly three arguments: dll, name and signature",
            );
        const text = e.arguments.map((argument) => {
            if (
                argument.kind === "Literal" &&
                typeof argument.value === "string"
            )
                return argument.value;
            if (
                argument.kind === "Template" &&
                argument.expressions.length === 0
            )
                return argument.quasis[0]!;
            return fail("define() arguments must be string literals", argument);
        });
        const [dll, name, signature] = text as [string, string, string];
        try {
            checkFfiNames(dll, name);
            parseFfiSignature(signature);
        } catch (error) {
            fail((error as Error).message);
        }
        const list = this.templateCaches.ffi;
        let index = list.findIndex(
            (d) =>
                d.dll.toLowerCase() === dll.toLowerCase() &&
                d.name === name &&
                d.signature.replace(/\s+/g, "") ===
                    signature.replace(/\s+/g, ""),
        );
        if (index < 0) {
            index = list.length;
            list.push({ dll, name, signature, span: e.span });
        }
        const dest = this.slot();
        this.emit({
            kind: "call",
            dest,
            target: "ffi." + index + ".get",
            arguments: [],
        });
        return dest;
    }
    protected preludeCall(name: string, args: number[]): number {
        const dest = this.slot();
        this.maxArguments = Math.max(this.maxArguments, args.length);
        this.emit({
            kind: "call",
            dest,
            target: "rt.prelude." + name,
            arguments: args,
        });
        return dest;
    }
    /** Annex B.3.8: a call expression target is evaluated, then ReferenceError. */
    protected callTargetError(call: A.Call): number {
        this.expression(call);
        this.emit({ kind: "immutableWrite", error: "ReferenceError" });
        return this.constant(undefined);
    }
    protected lowerOptionalChain(
        e: A.OptionalChain,
        mode: "value" | "delete",
        preserveReceiver = false,
    ): { value: number; receiver?: number } {
        const result = this.slot(),
            receiverResult = preserveReceiver ? this.slot() : undefined,
            join = this.block();
        if (receiverResult !== undefined) {
            const missing = this.constant(undefined);
            this.emit({ kind: "copy", dest: receiverResult, source: missing });
        }
        let state: ChainState;
        if (e.base.kind === "Member")
            state = { kind: "reference", reference: this.reference(e.base) };
        else if (e.base.kind === "OptionalChain") {
            const nested = this.optionalChainCallee(e.base);
            state = {
                kind: "value",
                slot: nested.callee,
                ...(nested.receiver === undefined
                    ? {}
                    : { receiver: nested.receiver }),
            };
        } else state = { kind: "value", slot: this.expression(e.base) };
        const materialize = (): number => {
            if (state.kind === "value") return state.slot;
            const slot = this.getReference(state.reference);
            state = { kind: "value", slot };
            return slot;
        };
        const optionalCheck = (slot: number): void => {
            const condition = this.slot();
            this.emit({
                kind: "unary",
                dest: condition,
                operator: "isNullish",
                argument: slot,
            });
            const short = this.block(),
                next = this.block();
            this.end({ kind: "branch", condition, yes: short.id, no: next.id });
            this.select(short);
            const skipped = this.constant(mode === "delete" ? true : undefined);
            this.emit({ kind: "copy", dest: result, source: skipped });
            this.end({ kind: "jump", target: join.id });
            this.select(next);
        };
        for (const link of e.links) {
            if (link.kind === "property") {
                const object = materialize();
                if (link.optional) optionalCheck(object);
                state = {
                    kind: "reference",
                    reference:
                        link.property.kind === "PrivateName"
                            ? {
                                  object,
                                  key: this.privateName(link.property),
                                  privateName: true,
                                  privateKind: link.property.privateKind,
                              }
                            : { object, key: this.expression(link.property) },
                };
            } else {
                let receiver: number | undefined;
                if (state.kind === "reference" && "object" in state.reference)
                    receiver =
                        state.reference.receiver ?? state.reference.object;
                else if (state.kind === "value") receiver = state.receiver;
                const callee = materialize();
                if (link.optional) optionalCheck(callee);
                const args = this.lowerArguments(link.arguments),
                    dest = this.slot();
                this.invokeWithArguments(dest, callee, args, receiver);
                state = { kind: "value", slot: dest };
            }
        }
        if (mode === "delete") {
            let value: number;
            if (state.kind === "reference" && "object" in state.reference) {
                if (state.reference.receiver !== undefined) {
                    this.emit({
                        kind: "immutableWrite",
                        error: "ReferenceError",
                    });
                    value = this.constant(undefined);
                } else {
                    value = this.slot();
                    this.emit({
                        kind: "property",
                        operation: "delete",
                        strict: this.strict,
                        dest: value,
                        object: state.reference.object,
                        key: state.reference.key,
                    });
                }
            } else {
                if (state.kind === "reference")
                    this.getReference(state.reference);
                value = this.constant(true);
            }
            this.emit({ kind: "copy", dest: result, source: value });
        } else {
            if (preserveReceiver && receiverResult !== undefined) {
                const receiver =
                    state.kind === "reference" && "object" in state.reference
                        ? (state.reference.receiver ?? state.reference.object)
                        : state.kind === "value"
                          ? state.receiver
                          : undefined;
                if (receiver !== undefined)
                    this.emit({
                        kind: "copy",
                        dest: receiverResult,
                        source: receiver,
                    });
            }
            const value = materialize();
            this.emit({ kind: "copy", dest: result, source: value });
        }
        this.end({ kind: "jump", target: join.id });
        this.select(join);
        return {
            value: result,
            ...(receiverResult === undefined
                ? {}
                : { receiver: receiverResult }),
        };
    }
    protected optionalChain(
        e: A.OptionalChain,
        mode: "value" | "delete",
    ): number {
        return this.lowerOptionalChain(e, mode).value;
    }
    protected optionalChainCallee(e: A.OptionalChain): {
        callee: number;
        receiver?: number;
    } {
        const result = this.lowerOptionalChain(e, "value", true);
        return {
            callee: result.value,
            ...(result.receiver === undefined
                ? {}
                : { receiver: result.receiver }),
        };
    }
}
