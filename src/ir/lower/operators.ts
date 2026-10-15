import type * as A from "../../frontend/ast.js";
import { internalError } from "../../diagnostics.js";
import { ExpressionLowerer } from "./expressions.js";

/** Unary, update, binary and conditional expressions. */
export abstract class OperatorLowerer extends ExpressionLowerer {
    protected lowerUnary(e: A.Unary): number {
        if (e.operator === "delete") {
            if (e.argument.kind === "OptionalChain")
                return this.optionalChain(e.argument, "delete");
            if (e.argument.kind === "Identifier") {
                const withRef = this.withResolution(e.argument),
                    id = e.argument;
                const staticDelete = (): number => {
                    const binding = this.binding(id);
                    if (binding.kind === "globalProperty") {
                        const object = this.globalObject(),
                            key = this.constant(binding.name),
                            dest = this.slot();
                        this.emit({
                            kind: "property",
                            operation: "delete",
                            strict: this.strict,
                            dest,
                            object,
                            key,
                        });
                        return dest;
                    }
                    return this.constant(false);
                };
                if (withRef)
                    return this.withBranch(
                        withRef,
                        () => {
                            const dest = this.slot();
                            this.emit({
                                kind: "property",
                                operation: "delete",
                                strict: false,
                                dest,
                                object: withRef.object,
                                key: this.constant(id.name),
                            });
                            return dest;
                        },
                        staticDelete,
                    );
                return staticDelete();
            }
            if (e.argument.kind === "Member") {
                // SuperProperty evaluation reads this (GetThisEnvironment) before the key.
                if (e.argument.object.kind === "Super") {
                    this.currentThis();
                    this.expression(e.argument.property);
                    this.emit({
                        kind: "immutableWrite",
                        error: "ReferenceError",
                    });
                    return this.constant(undefined);
                }
                const ref = this.reference(e.argument);
                if ("id" in ref)
                    throw internalError("lower", "Expected property", e.span);
                if (ref.receiver !== undefined) {
                    this.emit({
                        kind: "immutableWrite",
                        error: "ReferenceError",
                    });
                    return this.constant(undefined);
                }
                const dest = this.slot();
                this.emit({
                    kind: "property",
                    operation: "delete",
                    strict: this.strict,
                    dest,
                    ...ref,
                });
                return dest;
            }
            this.expression(e.argument);
            return this.constant(true);
        }
        const argument =
            e.operator === "typeof" && e.argument.kind === "Identifier"
                ? this.read(e.argument, true)
                : this.expression(e.argument);
        if (e.operator === "void") return this.constant(undefined);
        const dest = this.slot();
        this.emit({
            kind: "unary",
            dest,
            operator: e.operator,
            argument,
        });
        return dest;
    }
    protected lowerUpdate(e: A.Update): number {
        if ((e.argument as A.Node).kind === "Call")
            return this.callTargetError(e.argument as unknown as A.Call);
        const ref = this.settledReference(this.reference(e.argument)),
            previous = this.getReference(ref),
            numeric = this.slot();
        this.emit({
            kind: "unary",
            dest: numeric,
            operator: "numeric",
            argument: previous,
        });
        const next = this.slot();
        this.emit({
            kind: "unary",
            dest: next,
            operator: e.operator === "++" ? "increment" : "decrement",
            argument: numeric,
        });
        this.putReference(ref, next);
        return e.prefix ? next : numeric;
    }
    protected lowerBinary(e: A.Binary): number {
        if (e.operator === "+") {
            // Generated Unicode tables contain thousands of literal chunks.
            // Fold only strings, preserving coercion and operand side effects
            // for every nonliteral expression.
            const chunks: string[] = [];
            let part: A.Expression = e;
            while (
                part.kind === "Binary" &&
                part.operator === "+" &&
                part.right.kind === "Literal" &&
                typeof part.right.value === "string"
            ) {
                chunks.push(part.right.value);
                part = part.left;
            }
            if (part.kind === "Literal" && typeof part.value === "string") {
                chunks.push(part.value);
                return this.constant(chunks.reverse().join(""));
            }
        }
        if (e.operator === "in" && e.left.kind === "PrivateName") {
            const name = this.privateName(e.left);
            return this.preludeCall("privateIn", [
                name,
                this.expression(e.right),
            ]);
        }
        // typeof x === 'type' (also !==, ==, !=, either side): a test of the
        // value's tag, without the type name string and a string comparison.
        if (
            e.operator === "===" ||
            e.operator === "!==" ||
            e.operator === "==" ||
            e.operator === "!="
        ) {
            const typeName = (x: A.Expression) =>
                x.kind === "Literal" && typeof x.value === "string"
                    ? x.value
                    : undefined;
            const [test, name] =
                e.left.kind === "Unary" &&
                e.left.operator === "typeof" &&
                typeName(e.right) !== undefined
                    ? [e.left, typeName(e.right)!]
                    : e.right.kind === "Unary" &&
                        e.right.operator === "typeof" &&
                        typeName(e.left) !== undefined
                      ? [e.right, typeName(e.left)!]
                      : [undefined, ""];
            if (test) {
                const argument =
                        test.argument.kind === "Identifier"
                            ? this.read(test.argument, true)
                            : this.expression(test.argument),
                    dest = this.slot();
                this.emit({
                    kind: "unary",
                    dest,
                    operator:
                        (e.operator === "===" || e.operator === "=="
                            ? "typeofIs:"
                            : "typeofNot:") + name,
                    argument,
                });
                return dest;
            }
        }
        const left = this.expression(e.left);
        if (e.operator === ",") return this.expression(e.right);
        if (e.operator === "&&" || e.operator === "||" || e.operator === "??") {
            const dest = this.slot();
            this.emit({ kind: "copy", dest, source: left });
            const rightBlock = this.block(),
                join = this.block();
            let condition = left;
            if (e.operator === "??") {
                condition = this.slot();
                this.emit({
                    kind: "unary",
                    dest: condition,
                    operator: "isNullish",
                    argument: left,
                });
            }
            this.end({
                kind: "branch",
                condition,
                yes: e.operator === "||" ? join.id : rightBlock.id,
                no: e.operator === "||" ? rightBlock.id : join.id,
            });
            this.select(rightBlock);
            const right = this.expression(e.right);
            this.emit({ kind: "copy", dest, source: right });
            this.end({ kind: "jump", target: join.id });
            this.select(join);
            return dest;
        }
        const right = this.expression(e.right),
            dest = this.slot();
        if (e.operator === "in") {
            // The RHS must be checked before coercing the property key.
            this.emit({
                kind: "property",
                operation: "has",
                dest,
                object: right,
                key: left,
                ...(e.left.kind === "Literal" &&
                typeof e.left.value === "string"
                    ? { keyName: e.left.value }
                    : {}),
            });
        } else
            this.emit({
                kind: "binary",
                dest,
                operator: e.operator,
                left,
                right,
            });
        return dest;
    }
    protected lowerConditional(e: A.Conditional): number {
        const condition = this.expression(e.test),
            yes = this.block(),
            no = this.block(),
            join = this.block(),
            dest = this.slot();
        this.end({ kind: "branch", condition, yes: yes.id, no: no.id });
        this.select(yes);
        const a = this.expression(e.consequent);
        this.emit({ kind: "copy", dest, source: a });
        this.end({ kind: "jump", target: join.id });
        this.select(no);
        const b = this.expression(e.alternate);
        this.emit({ kind: "copy", dest, source: b });
        this.end({ kind: "jump", target: join.id });
        this.select(join);
        return dest;
    }
}
