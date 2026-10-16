import type * as A from "../../frontend/ast.js";
import type { WithReference } from "./base.js";
import { OperatorLowerer } from "./operators.js";

/** Assignment, `new` and call expressions. */
export abstract class AssignmentCallLowerer extends OperatorLowerer {
    protected lowerAssignment(e: A.Assignment): number {
        if (e.left.kind === "ArrayPattern" || e.left.kind === "ObjectPattern") {
            const right = this.expression(e.right);
            this.bindPattern(e.left, right, false, true);
            return right;
        }
        if ((e.left as A.Node).kind === "Call")
            return this.callTargetError(e.left as unknown as A.Call);
        // ES2021 logical assignment: the right side is evaluated, and the
        // reference written, only when the short-circuit does not apply.
        if (
            e.operator === "&&=" ||
            e.operator === "||=" ||
            e.operator === "??="
        ) {
            const ref = this.settledReference(this.reference(e.left, false)),
                previous = this.getReference(ref),
                dest = this.slot();
            this.emit({ kind: "copy", dest, source: previous });
            let condition = previous;
            if (e.operator === "??=") {
                condition = this.slot();
                this.emit({
                    kind: "unary",
                    dest: condition,
                    operator: "isNullish",
                    argument: previous,
                });
            }
            const assign = this.block(),
                join = this.block();
            this.end({
                kind: "branch",
                condition,
                yes: e.operator === "||=" ? join.id : assign.id,
                no: e.operator === "||=" ? assign.id : join.id,
            });
            this.select(assign);
            const right = this.expression(
                e.right,
                e.left.kind === "Identifier" && !e.parenthesizedTarget
                    ? e.left.name
                    : undefined,
            );
            this.putReference(ref, right);
            this.emit({ kind: "copy", dest, source: right });
            this.end({ kind: "jump", target: join.id });
            this.select(join);
            return dest;
        }
        // Compound assignment reads its left value BEFORE evaluating the RHS.
        const raw = this.reference(e.left, e.operator === "="),
            ref = e.operator === "=" ? raw : this.settledReference(raw),
            previous = e.operator === "=" ? null : this.getReference(ref);
        const right = this.expression(
            e.right,
            e.operator === "=" &&
                e.left.kind === "Identifier" &&
                !e.parenthesizedTarget
                ? e.left.name
                : undefined,
        );
        let result = right;
        if (previous !== null) {
            result = this.slot();
            this.emit({
                kind: "binary",
                dest: result,
                operator: e.operator.slice(0, -1),
                left: previous,
                right,
            });
        }
        this.putReference(ref, result);
        return result;
    }
    protected lowerNew(e: A.New): number {
        const callee = this.expression(e.callee),
            args = this.lowerArguments(e.arguments);
        const instance = this.slot(),
            result = this.slot(),
            dest = this.slot();
        this.emit({
            kind: "newInstance",
            dest: instance,
            callee,
            ...("array" in args
                ? { argumentArray: args.array }
                : args.fixed.length
                  ? { firstArgument: args.fixed[0] }
                  : {}),
        });
        this.invokeWithArguments(result, callee, args, instance, true);
        this.emit({
            kind: "constructorResult",
            dest,
            result,
            instance,
        });
        return dest;
    }
    protected lowerCall(e: A.Call): number {
        // Runtime helpers called by transformed code (eval-aot): \u0001name(args).
        // \u0001realmFunction(ctor, function(){...}): the realm-local maker's
        // closure in the realm of ctor when ctor is that realm's %Function%.
        if (
            e.callee.kind === "Identifier" &&
            e.callee.name === "\u0001realmFunction"
        ) {
            const maker = this.bound.functionNodes.get(
                    e.arguments[1] as A.FunctionExpression,
                )!,
                dest = this.slot();
            // A third argument names the intrinsic ctor must be (default %Function%).
            const intrinsic =
                e.arguments[2]?.kind === "Literal"
                    ? String((e.arguments[2] as A.Literal).value)
                    : undefined;
            this.emit({
                kind: "realmFunction",
                dest,
                ctor: this.expression(e.arguments[0] as A.Expression),
                target: `js.rfn.${maker.index}`,
                ...(intrinsic ? { intrinsic } : {}),
            });
            return dest;
        }
        if (
            e.callee.kind === "Identifier" &&
            e.callee.name.startsWith("\u0001")
        )
            return this.preludeCall(
                e.callee.name.slice(1),
                e.arguments.map((arg) => this.expression(arg as A.Expression)),
            );
        if (e.callee.kind === "Identifier") {
            const binding = this.bound.bindings.get(e.callee);
            if (
                binding &&
                binding.kind !== "globalProperty" &&
                binding.ffiDefine
            )
                return this.ffiDefine(e);
        }
        if (e.callee.kind === "Super") {
            const result = this.slot(),
                dest = this.slot();
            let base = this.slot(),
                receiver = this.slot();
            if (e.superRefs) {
                this.emit({
                    kind: "superConstructor",
                    dest: base,
                    func: this.read(e.superRefs.func),
                });
                receiver = this.read(e.superRefs.receiver);
            } else {
                this.emit({ kind: "superConstructor", dest: base });
                this.emit({ kind: "superReceiver", dest: receiver });
            }
            const target = this.slot();
            this.emit({ kind: "newTarget", dest: target });
            this.invokeWithArguments(
                result,
                base,
                this.lowerArguments(e.arguments),
                receiver,
                true,
                target,
            );
            this.emit({
                kind: "constructorResult",
                dest,
                result,
                instance: receiver,
            });
            this.emit({ kind: "setCurrentThis", source: dest });
            if (e.instanceFields)
                this.initializeInstance(dest, e.instanceFields);
            return dest;
        }
        if (
            e.callee.kind === "Identifier" &&
            this.bound.withChains.has(e.callee)
        ) {
            // A function found in an object environment is called with that object as this.
            const ref = this.reference(e.callee),
                withRef = (ref as { withRef: WithReference }).withRef;
            const receiver = this.withBranch(
                withRef,
                () => withRef.object,
                () => this.constant(undefined),
            );
            const callee = this.getReference(ref),
                args = this.lowerArguments(e.arguments),
                dest = this.slot();
            this.invokeWithArguments(dest, callee, args, receiver);
            return dest;
        }
        const optional =
            e.callee.kind === "OptionalChain"
                ? this.optionalChainCallee(e.callee)
                : undefined;
        const ref =
            !optional && e.callee.kind === "Member"
                ? this.reference(e.callee)
                : undefined;
        const receiver =
            optional?.receiver ??
            (ref && "object" in ref ? (ref.receiver ?? ref.object) : undefined);
        const callee =
            optional?.callee ??
            (ref ? this.getReference(ref) : this.expression(e.callee));
        const args = this.lowerArguments(e.arguments),
            dest = this.slot();
        this.invokeWithArguments(
            dest,
            callee,
            args,
            receiver,
            false,
            undefined,
            this.tailCalls.has(e),
            ref ? this.hasOwnCall(e.callee as A.Member, args) : undefined,
        );
        return dest;
    }
}
