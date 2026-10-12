import type * as A from "../../frontend/ast.js";
import { LowererBase } from "./base.js";

/** Class definitions: constructors, methods, accessors, fields, static blocks and private names. */
export abstract class ClassLowerer extends LowererBase {
    protected classValue(
        node: A.ClassExpression | A.ClassDeclaration,
        inferredName?: string | number,
    ): number {
        const classScope = this.bound.lexicalScopes.get(node);
        if (classScope) this.enterScope(node);
        const base = node.superClass ? this.expression(node.superClass) : null;
        const prototypeKey = this.constant("prototype");
        let basePrototype: number | null = null;
        const isNull = this.slot();
        if (base !== null) {
            this.emit({ kind: "validateClassHeritage", base });
            basePrototype = this.slot();
            const nullValue = this.constant(null),
                nullBranch = this.block(),
                objectBranch = this.block(),
                join = this.block();
            this.emit({
                kind: "binary",
                dest: isNull,
                operator: "===",
                left: base,
                right: nullValue,
            });
            this.end({
                kind: "branch",
                condition: isNull,
                yes: nullBranch.id,
                no: objectBranch.id,
            });
            this.select(nullBranch);
            this.emit({ kind: "copy", dest: basePrototype, source: nullValue });
            this.end({ kind: "jump", target: join.id });
            this.select(objectBranch);
            this.emit({
                kind: "property",
                operation: "get",
                dest: basePrototype,
                object: base,
                key: prototypeKey,
            });
            this.end({ kind: "jump", target: join.id });
            this.select(join);
            this.emit({
                kind: "validateClassPrototype",
                prototype: basePrototype,
            });
        }
        // Private names are created anew by each evaluation of the class.
        // One list per class, filled one name at a time: a slot per name would
        // keep thousands of values live in a class with thousands of names.
        let privateList: number | undefined;
        if (node.privateNames?.length) {
            privateList = this.slot();
            this.emit({
                kind: "newObject",
                dest: privateList,
                array: true,
                length: 0,
            });
            node.privateNames.forEach((name, index) =>
                this.emit({
                    kind: "setProperty",
                    strict: true,
                    object: privateList!,
                    key: this.constant(index),
                    source: this.preludeCall("privateName", [
                        this.constant(name.name),
                        this.constant(
                            name.kind === "field"
                                ? 0
                                : name.kind === "method"
                                  ? 1
                                  : 2,
                        ),
                    ]),
                    define: true,
                }),
            );
            this.store(this.binding(node.privateNames[0]!.id), privateList);
        }
        const constructor = this.closure(
            this.bound.functionNodes.get(node.constructorMethod)!,
            node.id?.name === "*default*"
                ? "default"
                : (node.id?.name ?? inferredName ?? ""),
        );
        const prototype = this.slot();
        this.emit({
            kind: "property",
            operation: "get",
            dest: prototype,
            object: constructor,
            key: prototypeKey,
        });
        if (base !== null) {
            // extends null keeps %Function.prototype% as the constructor's parent.
            const objectParent = this.block(),
                join = this.block();
            this.end({
                kind: "branch",
                condition: isNull,
                yes: join.id,
                no: objectParent.id,
            });
            this.select(objectParent);
            this.emit({
                kind: "setPrototype",
                object: constructor,
                prototype: base,
            });
            this.end({ kind: "jump", target: join.id });
            this.select(join);
            this.emit({
                kind: "setPrototype",
                object: prototype,
                prototype: basePrototype!,
            });
        }
        this.emit({
            kind: "setFunctionHomeObject",
            func: constructor,
            homeObject: prototype,
        });
        this.emit({
            kind: "defineDataProperty",
            object: constructor,
            key: prototypeKey,
            source: prototype,
            attributes: 0,
        });
        // Instance and static elements, as triples for rt.prelude.initializeFields:
        // brands of private methods first, then fields (and static blocks) in order.
        // Static elements as triples for rt.prelude.initializeFields, appended as
        // they are evaluated: brands of static private methods, then fields and blocks.
        const list = () => {
            const dest = this.slot();
            this.emit({ kind: "newObject", dest, array: true, length: 0 });
            return { dest, length: 0 };
        };
        const staticBrands = list(),
            staticFields = list(),
            branded = new Set<string>();
        const append = (
            target: { dest: number; length: number },
            values: number[],
        ) => {
            for (const source of values)
                this.emit({
                    kind: "setProperty",
                    strict: true,
                    object: target.dest,
                    key: this.constant(target.length++),
                    source,
                    define: true,
                });
        };
        const undefinedValue = this.constant(undefined);
        for (const method of node.methods) {
            const target = method.isStatic ? constructor : prototype;
            if (method.element === "field" && !method.isStatic) {
                // Defined by the instance initializer; a computed key is converted now.
                if (method.keyBinding) {
                    const rawKey = this.expression(method.key),
                        key = this.slot();
                    this.emit({
                        kind: "unary",
                        dest: key,
                        operator: "propertyKey",
                        argument: rawKey,
                    });
                    this.store(this.binding(method.keyBinding), key);
                }
                continue;
            }
            if (method.element === "staticBlock") {
                append(staticFields, [
                    this.constant(3),
                    this.closure(
                        this.bound.functionNodes.get(method.value!)!,
                        "",
                        constructor,
                    ),
                    undefinedValue,
                ]);
                continue;
            }
            if (method.key.kind === "PrivateName") {
                // A getter and setter share the binding of the name's first declaration.
                const name = this.slot();
                this.emit({
                    kind: "property",
                    operation: "get",
                    dest: name,
                    object: privateList!,
                    key: this.constant(
                        node.privateNames!.findIndex(
                            (declared) =>
                                declared.name ===
                                (method.key as A.PrivateName).name,
                        ),
                    ),
                });
                if (method.element === "field") {
                    append(staticFields, [
                        this.constant(2),
                        name,
                        method.value
                            ? this.closure(
                                  this.bound.functionNodes.get(method.value)!,
                                  "",
                                  target,
                              )
                            : undefinedValue,
                    ]);
                    continue;
                }
                const value = this.closure(
                    this.bound.functionNodes.get(method.value!)!,
                    (method.accessor ? method.accessor + " " : "") +
                        method.key.name,
                    target,
                );
                this.preludeCall("privateMethod", [
                    name,
                    value,
                    this.constant(
                        method.accessor === "get"
                            ? 1
                            : method.accessor === "set"
                              ? 2
                              : 0,
                    ),
                ]);
                if (method.isStatic && !branded.has(method.key.name)) {
                    branded.add(method.key.name);
                    append(staticBrands, [
                        this.constant(0),
                        name,
                        undefinedValue,
                    ]);
                }
                continue;
            }
            const rawKey = this.expression(method.key);
            let key = this.slot();
            this.emit({
                kind: "unary",
                dest: key,
                operator: "propertyKey",
                argument: rawKey,
            });
            if (method.element === "field") {
                append(staticFields, [
                    this.constant(1),
                    key,
                    method.value
                        ? this.closure(
                              this.bound.functionNodes.get(method.value)!,
                              "",
                              target,
                          )
                        : undefinedValue,
                ]);
                continue;
            }
            if (method.isStatic && method.computed)
                key = this.preludeCall("staticMethodKey", [key]);
            const value = this.closure(
                this.bound.functionNodes.get(method.value!)!,
                this.methodName(
                    key,
                    method.accessor ? method.accessor + " " : undefined,
                ),
                target,
            );
            if (method.accessor)
                this.emit({
                    kind: "defineAccessor",
                    object: target,
                    key,
                    source: value,
                    setter: method.accessor === "set",
                    nonEnumerable: true,
                });
            else
                this.emit({
                    kind: "defineDataProperty",
                    object: target,
                    key,
                    source: value,
                    attributes: 5,
                });
        }
        // The class binding is initialized after the elements are defined (computed keys see it uninitialized).
        if (classScope && node.id && node.id.name !== "*default*")
            this.store(classScope[0]!, constructor);
        if (node.instanceInitializer && node.instanceFields)
            this.store(
                this.binding(node.instanceFields),
                this.closure(
                    this.bound.functionNodes.get(node.instanceInitializer)!,
                    "",
                    prototype,
                ),
            );
        if (staticBrands.length)
            this.preludeCall("initializeFields", [
                constructor,
                staticBrands.dest,
            ]);
        if (staticFields.length)
            this.preludeCall("initializeFields", [
                constructor,
                staticFields.dest,
            ]);
        return constructor;
    }
    /** The record of a private name: an element of its class's list. */
    protected privateName(e: A.PrivateName): number {
        const dest = this.slot();
        this.emit({
            kind: "property",
            operation: "get",
            dest,
            object: this.read(e.id),
            key: this.constant(e.index!),
        });
        return dest;
    }
    /** Runs the class's instance initializer (its fields and private method brands) on a new this. */
    protected initializeInstance(
        instance: number,
        initializer: A.Identifier,
    ): void {
        const dest = this.slot();
        this.invokeWithArguments(
            dest,
            this.read(initializer),
            { fixed: [] },
            instance,
        );
    }
    /** One step of an instance initializer: define a field on this, or add a private method's brand. */
    protected classFieldDefinition(e: A.ClassFieldDefinition): number {
        const object = this.currentThis();
        if (e.key.kind === "PrivateName") {
            const name = this.privateName(e.key);
            if (e.brand) {
                this.preludeCall("privateBrand", [object, name]);
                return this.constant(undefined);
            }
            const value = e.value
                ? this.expression(e.value, e.key.name)
                : this.constant(undefined);
            this.preludeCall("privateDefine", [object, name, value]);
            return this.constant(undefined);
        }
        let key: number, name: string | number | undefined;
        if (e.key.kind === "Identifier") {
            key = this.read(e.key);
            const anonymous =
                !!e.value &&
                (e.value.kind === "FunctionExpression" ||
                    e.value.kind === "ClassExpression") &&
                !e.value.id;
            name = anonymous ? this.methodName(key) : undefined;
        } else {
            key = this.constant(e.key.value);
            name = String(e.key.value);
        }
        const value = e.value
            ? this.expression(e.value, name)
            : this.constant(undefined);
        this.emit({ kind: "defineField", object, key, source: value });
        return this.constant(undefined);
    }
}
