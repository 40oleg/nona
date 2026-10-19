import type * as A from "../../frontend/ast.js";
import { CompileError } from "../../diagnostics.js";
import {
    checkFfiNames,
    ffiLibraryKeys,
    parseFfiSignature,
    type FfiLibraries,
    type FfiLibraryKey,
} from "../../ffi.js";
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
                "define() expects exactly three arguments: library, name and signature",
            );
        const literal = (argument: A.Argument): string => {
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
        };
        // The library: a string literal, or an object literal of string
        // literals keyed by operating system (`{ win32, linux, darwin }`).
        const library = e.arguments[0]!;
        let libraries: FfiLibraries | undefined;
        if (library.kind === "ObjectLiteral") {
            libraries = {};
            for (const property of library.properties) {
                if ("spread" in property)
                    return fail(
                        "define() library keys must be win32, linux or darwin",
                        library,
                    );
                const key =
                    !property.computed && property.key.kind === "Identifier"
                        ? property.key.name
                        : property.key.kind === "Literal" &&
                            typeof property.key.value === "string"
                          ? property.key.value
                          : undefined;
                if (
                    key === undefined ||
                    property.accessor ||
                    !(ffiLibraryKeys as readonly string[]).includes(key)
                )
                    fail(
                        "define() library keys must be win32, linux or darwin",
                        property.key,
                    );
                libraries[key as FfiLibraryKey] = literal(property.value);
            }
            if (!Object.keys(libraries).length)
                fail(
                    "define() library object names no operating system",
                    library,
                );
        }
        const dll = libraries ? JSON.stringify(libraries) : literal(library),
            name = literal(e.arguments[1]!),
            signature = literal(e.arguments[2]!);
        // The target is unknown here; the compiler checks the names it
        // selects against the target's rules (E_FFI_STATIC / E_FFI_TARGET).
        try {
            if (libraries)
                for (const [os, value] of Object.entries(libraries))
                    checkFfiNames(value, name, os as FfiLibraryKey);
            else checkFfiNames(dll, name, undefined);
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
            list.push({
                dll,
                ...(libraries ? { libraries } : {}),
                name,
                signature,
                span: e.span,
            });
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
    /**
     * `x.end(JSON.stringify(a, r, s))` (#155): x.end, then JSON.stringify, then
     * the arguments are evaluated as usual, and rt.prelude.endJson ends the
     * message with the UTF-8 bytes of the JSON text when x.end is node:http's
     * own end and the function read is the intrinsic JSON.stringify (whatever
     * `JSON` resolves to). Otherwise it returns undefined and the two calls are
     * made as written.
     */
    protected endJsonCall(e: A.Call): number | undefined {
        const callee = e.callee,
            argument = e.arguments[0];
        const named = (node: A.Expression, name: string) =>
            node.kind === "Literal" && node.value === name;
        if (
            callee.kind !== "Member" ||
            callee.object.kind === "Super" ||
            !named(callee.property, "end") ||
            e.arguments.length !== 1 ||
            argument!.kind !== "Call"
        )
            return undefined;
        const inner = argument as A.Call,
            stringify = inner.callee;
        if (
            stringify.kind !== "Member" ||
            stringify.object.kind !== "Identifier" ||
            stringify.object.name !== "JSON" ||
            !named(stringify.property, "stringify") ||
            inner.arguments.length > 3 ||
            inner.arguments.some((arg) => arg.kind === "SpreadElement")
        )
            return undefined;
        const endRef = this.reference(callee) as {
                object: number;
                key: number;
            },
            end = this.getReference(endRef),
            jsonRef = this.reference(stringify) as {
                object: number;
                key: number;
            },
            fn = this.getReference(jsonRef),
            args = inner.arguments.map((arg) =>
                this.expression(arg as A.Expression),
            );
        const missing = this.constant(undefined),
            fast = this.preludeCall("endJson", [
                endRef.object,
                end,
                fn,
                ...[0, 1, 2].map((i) => args[i] ?? missing),
            ]);
        const result = this.slot(),
            nullish = this.slot(),
            slow = this.block(),
            done = this.block(),
            join = this.block();
        this.emit({
            kind: "unary",
            dest: nullish,
            operator: "isNullish",
            argument: fast,
        });
        this.end({
            kind: "branch",
            condition: nullish,
            yes: slow.id,
            no: done.id,
        });
        this.select(done);
        this.emit({ kind: "copy", dest: result, source: fast });
        this.end({ kind: "jump", target: join.id });
        this.select(slow);
        const text = this.slot(),
            value = this.slot();
        this.invokeWithArguments(text, fn, { fixed: args }, jsonRef.object);
        this.invokeWithArguments(value, end, { fixed: [text] }, endRef.object);
        this.emit({ kind: "copy", dest: result, source: value });
        this.end({ kind: "jump", target: join.id });
        this.select(join);
        return result;
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
