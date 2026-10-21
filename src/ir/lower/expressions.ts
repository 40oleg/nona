import type * as A from "../../frontend/ast.js";
import { CompileError } from "../../diagnostics.js";
import {
    maxInlineCapacity,
    inlineElementCapacity,
} from "../../shape-limits.js";
import { ControlLowerer } from "./control.js";

/**
 * The distinct keys, in definition order, of an object literal whose final
 * shape is known at compile time (#194): every property is a data property or
 * method with a literal key that a shaped object can hold (not an array index,
 * not `__proto__`; the same names rt.namedSetFast takes), with no spread,
 * computed key, accessor or prototype. Undefined otherwise.
 */
function staticLiteralKeys(e: A.ObjectLiteral): string[] | undefined {
    const keys: string[] = [];
    for (const p of e.properties) {
        if (
            "spread" in p ||
            p.computed ||
            p.accessor ||
            p.prototype ||
            p.key.kind !== "Literal" ||
            typeof p.key.value !== "string"
        )
            return undefined;
        const key = p.key.value;
        if (
            key === "" ||
            key === "__proto__" ||
            (key.charCodeAt(0) >= 48 && key.charCodeAt(0) <= 57)
        )
            return undefined;
        if (!keys.includes(key)) keys.push(key);
    }
    return keys.length && keys.length <= maxInlineCapacity ? keys : undefined;
}
/**
 * import.meta.url, filename and dirname of a module file, as Node.js sets them
 * (the URL percent-encodes what pathToFileURL encodes):
 * the module's path when the program was built (paths are canonical, a
 * Windows drive as `/C:/...`). Builtin modules have none.
 */
export function importMetaFields(
    path: string,
): { url: string; filename: string; dirname: string } | undefined {
    if (!path.startsWith("/") || path.includes("?")) return undefined;
    const drive = /^\/[A-Za-z]:\//.test(path);
    let url = "file://";
    for (const ch of path) {
        const code = ch.codePointAt(0)!;
        url +=
            code > 0x20 && code < 0x7f && !'"#%<>?[\\]^`{|}~'.includes(ch)
                ? ch
                : [...new TextEncoder().encode(ch)]
                      .map(
                          (b) =>
                              "%" +
                              b.toString(16).toUpperCase().padStart(2, "0"),
                      )
                      .join("");
    }
    const native = drive ? path.slice(1).split("/").join("\\") : path;
    const separator = drive ? "\\" : "/",
        at = native.lastIndexOf(separator);
    const dirname =
        at <= 0
            ? separator
            : drive && at === 2
              ? native.slice(0, 3)
              : native.slice(0, at);
    return { url, filename: native, dirname };
}
/** Most elements an array literal created with its element table has (#48); longer literals are built element by element. */
const maxLiteralElements = 4096;

/** Literal, template, `this`, `import`, `yield` and `await` expressions. */
export abstract class ExpressionLowerer extends ControlLowerer {
    protected lowerNewTarget(e: A.NewTarget): number {
        const dest = this.slot();
        this.emit({ kind: "newTarget", dest });
        return dest;
    }
    protected lowerThis(e: A.This): number {
        if (this.moduleIndex !== undefined && this.moduleIndex >= 0)
            return this.constant(undefined);
        const dest = this.slot();
        this.emit({ kind: "currentThis", dest });
        return dest;
    }
    protected lowerImportMeta(e: A.ImportMeta): number {
        const index =
            this.fn?.module ??
            (this.moduleIndex !== undefined && this.moduleIndex >= 0
                ? this.moduleIndex
                : undefined);
        if (index === undefined)
            throw new CompileError([
                {
                    code: "E_SYNTAX",
                    message: "import.meta is only valid in module code",
                    file: "",
                    span: e.span,
                },
            ]);
        return this.readStorage(this.bound.modules![index]!.meta);
    }
    protected lowerImportCall(e: A.ImportCall): number {
        const specifier = this.expression(e.argument),
            referrer = this.constant(
                this.fn?.module ??
                    (this.moduleIndex !== undefined && this.moduleIndex >= 0
                        ? this.moduleIndex
                        : -1),
            );
        return this.preludeCall("dynamicImport", [specifier, referrer]);
    }
    protected lowerRegExpLiteral(e: A.RegExpLiteral): number {
        const dest = this.slot(),
            pattern = this.constant(e.pattern),
            flags = this.constant(e.flags);
        this.maxArguments = Math.max(this.maxArguments, 2);
        this.emit({
            kind: "call",
            dest,
            target: "rt.RegExp.code",
            arguments: [pattern, flags],
        });
        return dest;
    }
    protected lowerYield(e: A.Yield): number {
        if (e.delegate && this.fn?.declaration.async)
            return this.asyncYieldStar(e.argument!);
        if (e.delegate) {
            const object = this.expression(e.argument!),
                iterator = this.slot(),
                next = this.slot(),
                result = this.slot(),
                sent = this.slot(),
                mode = this.slot(),
                returning = this.slot(),
                value = this.slot();
            const doneKey = this.constant("done"),
                valueKey = this.constant("value"),
                throwKey = this.constant("throw"),
                returnKey = this.constant("return");
            const falseValue = this.constant(false),
                trueValue = this.constant(true),
                one = this.constant(1),
                two = this.constant(2),
                undefinedValue = this.constant(undefined);
            this.emit({ kind: "getIterator", iterator, next, object });
            this.maxArguments = Math.max(this.maxArguments, 1);
            this.emit({
                kind: "copy",
                dest: returning,
                source: falseValue,
            });
            this.emit({
                kind: "invoke",
                dest: result,
                callee: next,
                arguments: [undefinedValue],
                receiver: iterator,
            });
            const inspect = this.block(),
                yielded = this.block(),
                dispatch = this.block(),
                again = this.block(),
                throwEntry = this.block(),
                returnEntry = this.block(),
                completion = this.block(),
                abruptReturn = this.block(),
                finish = this.block();
            this.end({ kind: "jump", target: inspect.id });
            this.select(inspect);
            this.emit({ kind: "requireObject", source: result });
            const done = this.slot();
            this.emit({
                kind: "property",
                operation: "get",
                dest: done,
                object: result,
                key: doneKey,
            });
            this.end({
                kind: "branch",
                condition: done,
                yes: completion.id,
                no: yielded.id,
            });
            this.select(yielded);
            this.emit({
                kind: "yieldDelegated",
                dest: sent,
                mode,
                source: result,
            });
            this.end({ kind: "jump", target: dispatch.id });
            this.select(dispatch);
            const isThrow = this.slot();
            this.emit({
                kind: "binary",
                dest: isThrow,
                operator: "===",
                left: mode,
                right: one,
            });
            const checkReturn = this.block();
            this.end({
                kind: "branch",
                condition: isThrow,
                yes: throwEntry.id,
                no: checkReturn.id,
            });
            this.select(checkReturn);
            const isReturn = this.slot();
            this.emit({
                kind: "binary",
                dest: isReturn,
                operator: "===",
                left: mode,
                right: two,
            });
            this.end({
                kind: "branch",
                condition: isReturn,
                yes: returnEntry.id,
                no: again.id,
            });
            this.select(again);
            this.emit({
                kind: "copy",
                dest: returning,
                source: falseValue,
            });
            this.emit({
                kind: "invoke",
                dest: result,
                callee: next,
                arguments: [sent],
                receiver: iterator,
            });
            this.end({ kind: "jump", target: inspect.id });
            this.select(throwEntry);
            const throwMethod = this.slot(),
                throwMissing = this.slot(),
                noThrow = this.block(),
                invokeThrow = this.block();
            this.emit({
                kind: "property",
                operation: "get",
                dest: throwMethod,
                object: iterator,
                key: throwKey,
            });
            this.emit({
                kind: "unary",
                dest: throwMissing,
                operator: "isNullish",
                argument: throwMethod,
            });
            this.end({
                kind: "branch",
                condition: throwMissing,
                yes: noThrow.id,
                no: invokeThrow.id,
            });
            this.select(noThrow);
            this.emit({ kind: "iteratorClose", iterator });
            this.emit({ kind: "immutableWrite" });
            this.end({ kind: "throw", value: sent });
            this.select(invokeThrow);
            this.emit({
                kind: "copy",
                dest: returning,
                source: falseValue,
            });
            this.emit({
                kind: "invoke",
                dest: result,
                callee: throwMethod,
                arguments: [sent],
                receiver: iterator,
            });
            this.end({ kind: "jump", target: inspect.id });
            this.select(returnEntry);
            const returnMethod = this.slot(),
                returnMissing = this.slot(),
                noReturn = this.block(),
                invokeReturn = this.block();
            this.emit({
                kind: "property",
                operation: "get",
                dest: returnMethod,
                object: iterator,
                key: returnKey,
            });
            this.emit({
                kind: "unary",
                dest: returnMissing,
                operator: "isNullish",
                argument: returnMethod,
            });
            this.end({
                kind: "branch",
                condition: returnMissing,
                yes: noReturn.id,
                no: invokeReturn.id,
            });
            this.select(noReturn);
            this.complete(
                { kind: "return", value: sent },
                0,
                0,
                [...this.controls]
                    .reverse()
                    .flatMap((c) =>
                        c.iterator === undefined ? [] : [c.iterator],
                    ),
            );
            this.select(invokeReturn);
            this.emit({
                kind: "copy",
                dest: returning,
                source: trueValue,
            });
            this.emit({
                kind: "invoke",
                dest: result,
                callee: returnMethod,
                arguments: [sent],
                receiver: iterator,
            });
            this.end({ kind: "jump", target: inspect.id });
            this.select(completion);
            this.emit({
                kind: "property",
                operation: "get",
                dest: value,
                object: result,
                key: valueKey,
            });
            this.end({
                kind: "branch",
                condition: returning,
                yes: abruptReturn.id,
                no: finish.id,
            });
            this.select(abruptReturn);
            this.complete(
                { kind: "return", value },
                0,
                0,
                [...this.controls]
                    .reverse()
                    .flatMap((c) =>
                        c.iterator === undefined ? [] : [c.iterator],
                    ),
            );
            this.select(finish);
            return value;
        }
        let source =
            e.argument === null
                ? this.constant(undefined)
                : this.expression(e.argument);
        const dest = this.slot();
        // AsyncGeneratorYield awaits the operand before yielding it.
        if (this.fn?.declaration.async) {
            const awaited = this.slot();
            this.emit({ kind: "await", dest: awaited, source });
            source = awaited;
        }
        this.emit({ kind: "yield", dest, source });
        return dest;
    }
    protected lowerAwait(e: A.Await): number {
        const source = this.expression(e.argument),
            dest = this.slot();
        this.emit({ kind: "await", dest, source });
        return dest;
    }
    protected lowerTaggedTemplate(e: A.TaggedTemplate): number {
        const optional =
            e.tag.kind === "OptionalChain"
                ? this.optionalChainCallee(e.tag)
                : undefined;
        const ref =
            !optional && e.tag.kind === "Member"
                ? this.reference(e.tag)
                : undefined;
        const receiver =
            optional?.receiver ??
            (ref && "object" in ref ? (ref.receiver ?? ref.object) : undefined);
        const callee =
            optional?.callee ??
            (ref ? this.getReference(ref) : this.expression(e.tag));
        const cache = this.templateCaches.next++,
            cached = this.slot(),
            missing = this.slot(),
            undefinedValue = this.constant(undefined);
        this.emit({ kind: "loadGlobal", dest: cached, index: cache });
        this.emit({
            kind: "binary",
            dest: missing,
            operator: "===",
            left: cached,
            right: undefinedValue,
        });
        const create = this.block(),
            ready = this.block();
        this.end({
            kind: "branch",
            condition: missing,
            yes: create.id,
            no: ready.id,
        });
        this.select(create);
        const cooked = this.slot(),
            raw = this.slot();
        this.emit({
            kind: "newObject",
            dest: cooked,
            array: true,
            length: e.quasis.length,
        });
        this.emit({
            kind: "newObject",
            dest: raw,
            array: true,
            length: e.rawQuasis.length,
        });
        for (let i = 0; i < e.quasis.length; i++) {
            const key = this.constant(String(i)),
                cookedValue = this.constant(e.quasis[i]),
                rawValue = this.constant(e.rawQuasis[i]!);
            this.emit({
                kind: "setProperty",
                object: cooked,
                key,
                source: cookedValue,
                define: true,
            });
            this.emit({
                kind: "setProperty",
                object: raw,
                key,
                source: rawValue,
                define: true,
            });
        }
        const frozenRaw = this.slot(),
            frozenCooked = this.slot();
        this.maxArguments = Math.max(this.maxArguments, 1);
        this.emit({
            kind: "call",
            dest: frozenRaw,
            target: "rt.Object.freeze.fn.code",
            arguments: [raw],
        });
        this.emit({
            kind: "defineDataProperty",
            object: cooked,
            key: this.constant("raw"),
            source: raw,
            attributes: 0,
        });
        this.emit({
            kind: "call",
            dest: frozenCooked,
            target: "rt.Object.freeze.fn.code",
            arguments: [cooked],
        });
        this.emit({
            kind: "storeGlobal",
            index: cache,
            source: cooked,
        });
        this.end({ kind: "jump", target: ready.id });
        this.select(ready);
        const template = this.slot();
        this.emit({ kind: "loadGlobal", dest: template, index: cache });
        const substitutions = e.expressions.map((expression) =>
                this.expression(expression),
            ),
            dest = this.slot();
        this.invokeWithArguments(
            dest,
            callee,
            { fixed: [template, ...substitutions] },
            receiver,
            false,
            undefined,
            this.tailCalls.has(e),
        );
        return dest;
    }
    protected lowerTemplate(e: A.Template): number {
        let result = this.constant(e.quasis[0]!);
        for (let i = 0; i < e.expressions.length; i++) {
            const value = this.expression(e.expressions[i]!),
                string = this.slot();
            this.emit({
                kind: "unary",
                dest: string,
                operator: "string",
                argument: value,
            });
            const joined = this.slot();
            this.emit({
                kind: "binary",
                dest: joined,
                operator: "+",
                left: result,
                right: string,
            });
            const suffix = this.constant(e.quasis[i + 1]!),
                next = this.slot();
            this.emit({
                kind: "binary",
                dest: next,
                operator: "+",
                left: joined,
                right: suffix,
            });
            result = next;
        }
        return result;
    }
    protected lowerObjectOrArrayLiteral(
        e: A.ObjectLiteral | A.ArrayLiteral,
    ): number {
        const spread =
            e.kind === "ArrayLiteral" &&
            e.elements.some((item) => item?.kind === "SpreadElement");
        const keys =
            e.kind === "ObjectLiteral" ? staticLiteralKeys(e) : undefined;
        // An array literal without holes or spread is created with its
        // element table, and its elements are stored into it (#48).
        const elements =
            e.kind === "ArrayLiteral" &&
            !spread &&
            e.elements.length > 0 &&
            e.elements.length <= maxLiteralElements &&
            e.elements.every((item) => item !== null);
        // An object literal with known keys and no methods (whose home object
        // would have to exist first) evaluates its values before the object
        // is created, which is not observable: newObject then allocates and
        // fills the object in one write pass, without a slot-clearing pass
        // and with nothing in between that could reach a collection (#48).
        if (
            e.kind === "ObjectLiteral" &&
            keys &&
            !e.properties.some(
                (p) =>
                    !("spread" in p) &&
                    p.value.kind === "FunctionExpression" &&
                    p.value.method,
            )
        ) {
            const values: number[] = new Array(keys.length),
                keySlots = keys.map((key) => this.constant(key));
            for (const p of e.properties) {
                if ("spread" in p) continue;
                const name = (p.key as A.Literal).value as string;
                // A later definition of a duplicate key replaces the value
                // and keeps the first position.
                values[keys.indexOf(name)] = this.expression(p.value, name);
            }
            const dest = this.slot();
            this.emit({
                kind: "newObject",
                dest,
                array: false,
                length: 0,
                slots: e.properties.length,
                keys,
                literal: { keys: keySlots, values, strict: this.strict },
            });
            return dest;
        }
        // So does a small array literal whose table fits in its cell.
        if (
            e.kind === "ArrayLiteral" &&
            elements &&
            e.elements.length <= inlineElementCapacity
        ) {
            const elementValues = e.elements.map((item) =>
                    this.expression(item as A.Expression),
                ),
                dest = this.slot();
            this.emit({
                kind: "newObject",
                dest,
                array: true,
                length: e.elements.length,
                elements: true,
                elementValues,
            });
            return dest;
        }
        const dest = this.slot();
        this.emit({
            kind: "newObject",
            dest,
            array: e.kind === "ArrayLiteral",
            length:
                e.kind === "ArrayLiteral" && !spread ? e.elements.length : 0,
            ...(e.kind === "ObjectLiteral"
                ? {
                      slots: e.properties.filter((p) => !("spread" in p))
                          .length,
                  }
                : {}),
            ...(keys ? { keys } : {}),
            ...(elements ? { elements: true } : {}),
        });
        if (e.kind === "ArrayLiteral" && !spread)
            e.elements.forEach((item, i) => {
                if (item && item.kind !== "SpreadElement") {
                    const key = this.constant(i),
                        source = this.expression(item);
                    this.emit({
                        kind: "setProperty",
                        strict: this.strict,
                        object: dest,
                        key,
                        source,
                        define: true,
                        ...(elements ? { literalElement: i } : {}),
                    });
                }
            });
        else if (e.kind === "ArrayLiteral") {
            const index = this.slot(),
                zero = this.constant(0),
                one = this.constant(1);
            this.emit({ kind: "copy", dest: index, source: zero });
            const append = (source: number) => {
                this.emit({
                    kind: "setProperty",
                    strict: this.strict,
                    object: dest,
                    key: index,
                    source,
                    define: true,
                });
                const next = this.slot();
                this.emit({
                    kind: "binary",
                    dest: next,
                    operator: "+",
                    left: index,
                    right: one,
                });
                this.emit({ kind: "copy", dest: index, source: next });
            };
            for (const item of e.elements) {
                if (!item) {
                    const next = this.slot();
                    this.emit({
                        kind: "binary",
                        dest: next,
                        operator: "+",
                        left: index,
                        right: one,
                    });
                    this.emit({
                        kind: "copy",
                        dest: index,
                        source: next,
                    });
                    continue;
                }
                if (item.kind !== "SpreadElement") {
                    append(this.expression(item));
                    continue;
                }
                const object = this.expression(item.argument),
                    iterator = this.slot(),
                    next = this.slot();
                this.emit({
                    kind: "getIterator",
                    iterator,
                    next,
                    object,
                });
                const condition = this.block(),
                    body = this.block(),
                    join = this.block();
                this.end({ kind: "jump", target: condition.id });
                this.select(condition);
                const value = this.slot(),
                    done = this.slot();
                this.emit({
                    kind: "iteratorStep",
                    dest: value,
                    done,
                    iterator,
                    next,
                });
                this.end({
                    kind: "branch",
                    condition: done,
                    yes: join.id,
                    no: body.id,
                });
                this.select(body);
                append(value);
                this.end({ kind: "jump", target: condition.id });
                this.select(join);
            }
            const lengthKey = this.constant("length");
            this.emit({
                kind: "setProperty",
                strict: true,
                object: dest,
                key: lengthKey,
                source: index,
                define: false,
            });
        } else
            for (const p of e.properties) {
                if ("spread" in p) {
                    const source = this.expression(p.spread),
                        copied = this.slot();
                    this.maxArguments = Math.max(this.maxArguments, 2);
                    this.emit({
                        kind: "call",
                        dest: copied,
                        target: "rt.copyDataProperties",
                        arguments: [dest, source],
                    });
                    continue;
                }
                // A literal key of a static literal is already a property key.
                let key: number;
                if (keys)
                    key = this.constant((p.key as A.Literal).value as string);
                else {
                    const raw = this.expression(p.key);
                    key = this.slot();
                    this.emit({
                        kind: "unary",
                        dest: key,
                        operator: "propertyKey",
                        argument: raw,
                    });
                }
                const functionName = keys
                    ? ((p.key as A.Literal).value as string)
                    : p.value.kind === "FunctionExpression" ||
                        p.value.kind === "ClassExpression"
                      ? this.methodName(
                            key,
                            p.accessor ? p.accessor + " " : undefined,
                        )
                      : key;
                const source =
                    p.value.kind === "FunctionExpression" && p.value.method
                        ? this.closure(
                              this.bound.functionNodes.get(p.value)!,
                              functionName,
                              dest,
                          )
                        : this.expression(
                              p.value,
                              p.prototype ? undefined : functionName,
                          );
                if (p.prototype)
                    this.emit({
                        kind: "setPrototype",
                        object: dest,
                        prototype: source,
                    });
                else if (p.accessor)
                    this.emit({
                        kind: "defineAccessor",
                        object: dest,
                        key,
                        source,
                        setter: p.accessor === "set",
                    });
                else
                    this.emit({
                        kind: "setProperty",
                        strict: this.strict,
                        object: dest,
                        key,
                        source,
                        define: true,
                        ...(keys
                            ? {
                                  literalSlot: keys.indexOf(
                                      (p.key as A.Literal).value as string,
                                  ),
                              }
                            : {}),
                    });
            }
        return dest;
    }
}
