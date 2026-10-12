import { boundNames } from "../../frontend/declarations.js";
import type * as A from "../../frontend/ast.js";
import type { StorageBinding } from "../../frontend/bound.js";
import type { Terminator } from "../model.js";
import { internalError } from "../../diagnostics.js";
import { PatternLowerer } from "./patterns.js";

/** Statements and completions: break/continue/return through finally blocks, iterator closing, for await, try/catch. */
export abstract class ControlLowerer extends PatternLowerer {
    protected complete(
        term: Terminator,
        handlerDepth: number,
        finalizerDepth: number,
        closeIterators: number[] = [],
    ): void {
        const handlers = this.handlers,
            finalizers = this.finalizers,
            controls = this.controls;
        this.handlers = [...handlers];
        for (let i = finalizers.length - 1; i >= finalizerDepth; i--) {
            const finalizer = finalizers[i]!;
            while (this.handlers.length > finalizer.handlerDepth) {
                this.emit({ kind: "popHandler" });
                this.handlers.pop();
            }
            this.finalizers = finalizers.slice(0, i);
            this.controls = [...finalizer.controls];
            // A fresh block records the outer exceptional edge after handler removal.
            const entry = this.block();
            this.end({ kind: "jump", target: entry.id });
            this.select(entry);
            this.statement(finalizer.body);
            if (this.terminated) break;
        }
        if (!this.terminated) {
            while (this.handlers.length > handlerDepth) {
                this.emit({ kind: "popHandler" });
                this.handlers.pop();
            }
            for (const iterator of closeIterators) {
                const doneFlag = this.iteratorDoneFlags.get(iterator);
                if (doneFlag !== undefined) {
                    const close = this.block(),
                        skip = this.block();
                    this.end({
                        kind: "branch",
                        condition: doneFlag,
                        yes: skip.id,
                        no: close.id,
                    });
                    this.select(close);
                    this.emit({ kind: "iteratorClose", iterator });
                    this.end({ kind: "jump", target: skip.id });
                    this.select(skip);
                } else if (this.asyncIterators.has(iterator))
                    this.asyncIteratorClose(iterator);
                else this.emit({ kind: "iteratorClose", iterator });
            }
            // A derived constructor checks its result after leaving every try block ([[Construct]] step 10-12).
            if (
                term.kind === "return" &&
                this.fn?.declaration.kind === "FunctionExpression" &&
                this.fn.declaration.derivedConstructor
            ) {
                const entry = this.block();
                this.end({ kind: "jump", target: entry.id });
                this.select(entry);
                const checked = this.slot();
                this.emit({
                    kind: "derivedReturn",
                    dest: checked,
                    source: term.value,
                });
                term = { kind: "return", value: checked };
            }
            this.end(term);
        }
        this.handlers = handlers;
        this.finalizers = finalizers;
        this.controls = controls;
    }
    /** AsyncIteratorClose for a normal completion: await return() and require an object. */
    protected asyncIteratorClose(iterator: number): void {
        const method = this.slot(),
            missing = this.slot(),
            result = this.slot(),
            awaited = this.slot(),
            call = this.block(),
            join = this.block();
        this.emit({
            kind: "property",
            operation: "get",
            dest: method,
            object: iterator,
            key: this.constant("return"),
        });
        this.emit({
            kind: "unary",
            dest: missing,
            operator: "isNullish",
            argument: method,
        });
        this.end({
            kind: "branch",
            condition: missing,
            yes: join.id,
            no: call.id,
        });
        this.select(call);
        this.emit({
            kind: "invoke",
            dest: result,
            callee: method,
            arguments: [],
            receiver: iterator,
        });
        this.emit({ kind: "await", dest: awaited, source: result });
        this.emit({ kind: "requireObject", source: awaited });
        this.end({ kind: "jump", target: join.id });
        this.select(join);
    }
    /** yield* in an async generator (YieldExpression evaluation, generatorKind async). */
    protected asyncYieldStar(argument: A.Expression): number {
        const object = this.expression(argument),
            iterator = this.slot(),
            next = this.slot(),
            result = this.slot(),
            sent = this.slot(),
            mode = this.slot(),
            value = this.slot();
        const doneKey = this.constant("done"),
            valueKey = this.constant("value"),
            throwKey = this.constant("throw"),
            returnKey = this.constant("return");
        const one = this.constant(1),
            two = this.constant(2),
            undefinedValue = this.constant(undefined);
        this.maxArguments = Math.max(this.maxArguments, 1);
        this.emit({
            kind: "call",
            dest: iterator,
            target: "rt.prelude.getAsyncIterator",
            arguments: [object],
        });
        this.emit({
            kind: "property",
            operation: "get",
            dest: next,
            object: iterator,
            key: this.constant("next"),
        });
        const raw = this.slot(),
            returning = this.slot();
        this.emit({
            kind: "copy",
            dest: returning,
            source: this.constant(false),
        });
        this.emit({
            kind: "invoke",
            dest: raw,
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
            completion = this.block();
        this.end({ kind: "jump", target: inspect.id });
        this.select(inspect);
        // Every inner result is awaited, then must be an object.
        this.emit({ kind: "await", dest: result, source: raw });
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
        const yieldedValue = this.slot();
        this.emit({
            kind: "property",
            operation: "get",
            dest: yieldedValue,
            object: result,
            key: valueKey,
        });
        this.emit({
            kind: "yieldDelegated",
            dest: sent,
            mode,
            source: yieldedValue,
            value: true,
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
            source: this.constant(false),
        });
        this.emit({
            kind: "invoke",
            dest: raw,
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
        this.asyncIteratorClose(iterator);
        this.emit({ kind: "immutableWrite" });
        this.end({ kind: "throw", value: sent });
        this.select(invokeThrow);
        this.emit({
            kind: "copy",
            dest: returning,
            source: this.constant(false),
        });
        this.emit({
            kind: "invoke",
            dest: raw,
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
        const closeOuter = () =>
            [...this.controls]
                .reverse()
                .flatMap((c) => (c.iterator === undefined ? [] : [c.iterator]));
        this.select(noReturn);
        const awaitedSent = this.slot();
        this.emit({ kind: "await", dest: awaitedSent, source: sent });
        this.complete(
            { kind: "return", value: awaitedSent },
            0,
            0,
            closeOuter(),
        );
        this.select(invokeReturn);
        this.emit({
            kind: "copy",
            dest: returning,
            source: this.constant(true),
        });
        this.emit({
            kind: "invoke",
            dest: raw,
            callee: returnMethod,
            arguments: [sent],
            receiver: iterator,
        });
        this.end({ kind: "jump", target: inspect.id });
        const abruptReturn = this.block(),
            finish = this.block();
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
        const awaitedValue = this.slot();
        this.emit({ kind: "await", dest: awaitedValue, source: value });
        this.complete(
            { kind: "return", value: awaitedValue },
            0,
            0,
            closeOuter(),
        );
        this.select(finish);
        return value;
    }
    /** for await (... of ...): ES2020 ForIn/OfBodyEvaluation with iterationKind async. */
    protected forAwaitOf(s: A.ForOf, labels: string[]): void {
        if (s.left.kind === "Var" && s.left.declarationKind !== "var")
            this.enterScope(s);
        const object = this.expression(s.right),
            iterator = this.slot(),
            next = this.slot();
        this.maxArguments = Math.max(this.maxArguments, 1);
        this.emit({
            kind: "call",
            dest: iterator,
            target: "rt.prelude.getAsyncIterator",
            arguments: [object],
        });
        this.emit({
            kind: "property",
            operation: "get",
            dest: next,
            object: iterator,
            key: this.constant("next"),
        });
        this.asyncIterators.add(iterator);
        const cond = this.block(),
            bodyEntry = this.block(),
            update = this.block(),
            join = this.block(),
            caught = this.block(),
            error = this.slot(),
            handlerIndex = this.handlerCount++;
        this.end({ kind: "jump", target: cond.id });
        this.select(cond);
        const result = this.slot(),
            awaited = this.slot(),
            done = this.slot(),
            key = this.slot();
        this.emit({
            kind: "invoke",
            dest: result,
            callee: next,
            arguments: [],
            receiver: iterator,
        });
        this.emit({ kind: "await", dest: awaited, source: result });
        this.emit({ kind: "requireObject", source: awaited });
        this.emit({
            kind: "property",
            operation: "get",
            dest: done,
            object: awaited,
            key: this.constant("done"),
        });
        const valueBlock = this.block();
        this.end({
            kind: "branch",
            condition: done,
            yes: join.id,
            no: valueBlock.id,
        });
        this.select(valueBlock);
        this.emit({
            kind: "property",
            operation: "get",
            dest: key,
            object: awaited,
            key: this.constant("value"),
        });
        this.end({ kind: "jump", target: bodyEntry.id });
        this.controls.push({
            handlerDepth: this.handlers.length,
            finalizerDepth: this.finalizers.length,
            stop: join.id,
            next: update.id,
            labels,
            unlabelledBreak: true,
            iterator,
        });
        this.select(bodyEntry);
        this.emit({
            kind: "pushHandler",
            index: handlerIndex,
            target: caught.id,
            error,
            handlerKind: "finally",
        });
        this.handlers.push(caught.id);
        const body = this.block();
        this.end({ kind: "jump", target: body.id });
        this.select(body);
        if (s.left.kind === "Var" && s.left.declarationKind !== "var")
            this.enterScope(s);
        this.assignLoopTarget(s.left, key);
        this.statement(s.body);
        if (!this.terminated) {
            this.emit({ kind: "popHandler" });
            this.end({ kind: "jump", target: update.id });
        }
        this.handlers.pop();
        // A throw completion closes the iterator and then rethrows the original error.
        const rethrow = this.block(),
            closeFailed = this.block(),
            closeError = this.slot(),
            closeIndex = this.handlerCount++;
        this.select(caught);
        this.returnMarkerBranch(error, () => this.asyncIteratorClose(iterator));
        this.emit({
            kind: "pushHandler",
            index: closeIndex,
            target: closeFailed.id,
            error: closeError,
        });
        this.handlers.push(closeFailed.id);
        const closing = this.block();
        this.end({ kind: "jump", target: closing.id });
        this.select(closing);
        const method = this.slot(),
            missing = this.slot(),
            closeResult = this.slot(),
            closeAwaited = this.slot(),
            call = this.block(),
            closed = this.block();
        this.emit({
            kind: "property",
            operation: "get",
            dest: method,
            object: iterator,
            key: this.constant("return"),
        });
        this.emit({
            kind: "unary",
            dest: missing,
            operator: "isNullish",
            argument: method,
        });
        this.end({
            kind: "branch",
            condition: missing,
            yes: closed.id,
            no: call.id,
        });
        this.select(call);
        this.emit({
            kind: "invoke",
            dest: closeResult,
            callee: method,
            arguments: [],
            receiver: iterator,
        });
        this.emit({ kind: "await", dest: closeAwaited, source: closeResult });
        this.end({ kind: "jump", target: closed.id });
        this.select(closed);
        this.emit({ kind: "popHandler" });
        this.end({ kind: "jump", target: rethrow.id });
        this.handlers.pop();
        this.select(closeFailed);
        this.end({ kind: "jump", target: rethrow.id });
        this.select(rethrow);
        this.end({ kind: "throw", value: error });
        this.select(update);
        this.end({ kind: "jump", target: cond.id });
        this.controls.pop();
        this.select(join);
    }
    protected tryCatch(s: A.Try): void {
        if (!s.handler) {
            this.statement(s.body);
            return;
        }
        const caught = this.block(),
            join = this.block(),
            error = this.slot(),
            index = this.handlerCount++;
        this.emit({ kind: "pushHandler", index, target: caught.id, error });
        this.handlers.push(caught.id);
        const body = this.block();
        this.end({ kind: "jump", target: body.id });
        this.select(body);
        this.statement(s.body);
        if (!this.terminated) {
            this.emit({ kind: "popHandler" });
            this.end({ kind: "jump", target: join.id });
        }
        this.handlers.pop();
        this.select(caught);
        if (s.parameter?.kind === "Identifier") {
            const binding = this.binding(s.parameter) as StorageBinding;
            if (binding.captured)
                this.emit({
                    kind: "newCell",
                    dest: binding.index,
                    source: error,
                });
            else this.store(binding, error);
        } else if (s.parameter) {
            // Pattern bindings start uninitialized (TDZ for initializers), then bind like a let declaration.
            for (const id of boundNames(s.parameter)) {
                const binding = this.binding(id) as StorageBinding,
                    empty = this.slot();
                this.emit({ kind: "uninitialized", dest: empty });
                if (binding.captured)
                    this.emit({
                        kind: "newCell",
                        dest: binding.index,
                        source: empty,
                    });
                else this.store(binding, empty);
            }
            this.bindPattern(s.parameter, error, true);
        }
        this.statement(s.handler);
        if (!this.terminated) this.end({ kind: "jump", target: join.id });
        this.select(join);
    }
    protected statement(s: A.Statement, labels: string[] = []): void {
        if (this.terminated) return;
        switch (s.kind) {
            case "Throw":
                this.end({ kind: "throw", value: this.expression(s.argument) });
                break;
            case "Try": {
                if (!s.finalizer) {
                    this.tryCatch(s);
                    break;
                }
                const caught = this.block(),
                    normal = this.block(),
                    join = this.block(),
                    error = this.slot(),
                    index = this.handlerCount++;
                this.finalizers.push({
                    body: s.finalizer,
                    handlerDepth: this.handlers.length,
                    controls: [...this.controls],
                });
                this.emit({
                    kind: "pushHandler",
                    index,
                    target: caught.id,
                    error,
                    handlerKind: "finally",
                });
                this.handlers.push(caught.id);
                const body = this.block();
                this.end({ kind: "jump", target: body.id });
                this.select(body);
                this.tryCatch(s);
                if (!this.terminated) {
                    this.emit({ kind: "popHandler" });
                    this.end({ kind: "jump", target: normal.id });
                }
                this.handlers.pop();
                this.finalizers.pop();
                this.select(normal);
                this.statement(s.finalizer);
                if (!this.terminated)
                    this.end({ kind: "jump", target: join.id });
                this.select(caught);
                this.statement(s.finalizer);
                if (!this.terminated) this.end({ kind: "throw", value: error });
                this.select(join);
                break;
            }
            case "Function": {
                // Annex B.3.3: evaluating the declaration copies the block binding to the var binding.
                const target = this.bound.annexBFunctions?.get(s);
                if (target) this.store(target, this.readStatic(s.id));
                break;
            }
            case "Empty":
            case "Debugger":
            case "Import":
                break;
            case "Export": {
                if (s.declaration) this.statement(s.declaration);
                else if (s.defaultExpression) {
                    const value = this.expression(
                        s.defaultExpression,
                        "default",
                    );
                    this.write(s.defaultId!, value, true);
                }
                break;
            }
            case "Class":
                this.write(s.id, this.classValue(s), true);
                break;
            case "Block":
                this.enterScope(s);
                s.body.forEach((v) => this.statement(v));
                break;
            case "With": {
                const object = this.preludeCall("withObject", [
                    this.expression(s.object),
                ]);
                this.enterScope(s);
                this.store(
                    this.bound.bindings.get(s) as StorageBinding,
                    object,
                );
                this.statement(s.body);
                break;
            }
            case "Var":
                for (const d of s.declarations) {
                    if (
                        d.init &&
                        s.declarationKind === "var" &&
                        d.id.kind === "Identifier" &&
                        this.bound.withChains.has(d.id)
                    ) {
                        // The reference is resolved through with objects before the initializer runs.
                        const ref = this.withResolution(d.id)!;
                        this.write(
                            d.id,
                            this.expression(d.init, d.id.name),
                            false,
                            ref,
                        );
                    } else if (d.init)
                        this.bindPattern(
                            d.id,
                            this.expression(
                                d.init,
                                d.id.kind === "Identifier"
                                    ? d.id.name
                                    : undefined,
                            ),
                            s.declarationKind !== "var",
                        );
                    else if (
                        s.declarationKind !== "var" &&
                        d.id.kind === "Identifier"
                    )
                        this.write(d.id, this.constant(undefined), true);
                }
                break;
            case "ExpressionStatement":
                this.expression(s.expression);
                break;
            case "Return": {
                const derived =
                    this.fn?.declaration.kind === "FunctionExpression" &&
                    this.fn.declaration.derivedConstructor;
                if (s.argument && this.tailPosition())
                    this.collectTailCalls(s.argument);
                // A field initializer names an anonymous function after the field (its parameter).
                const fieldName =
                    this.fn?.declaration.kind === "FunctionExpression" &&
                    this.fn.declaration.fieldInitializer &&
                    s.argument &&
                    (s.argument.kind === "FunctionExpression" ||
                        s.argument.kind === "ClassExpression") &&
                    !s.argument.id
                        ? this.methodName(
                              this.read(
                                  this.fn.declaration
                                      .parameters[0] as A.Identifier,
                              ),
                          )
                        : undefined;
                let value = s.argument
                    ? this.expression(s.argument, fieldName)
                    : this.constant(undefined);
                // Async generator return awaits its operand (ES2020 14.4.14 Return).
                if (
                    s.argument &&
                    this.fn?.declaration.async &&
                    this.fn.declaration.generator
                ) {
                    const awaited = this.slot();
                    this.emit({ kind: "await", dest: awaited, source: value });
                    value = awaited;
                }
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
                break;
            }
            case "Break":
            case "Continue": {
                const target = [...this.controls]
                    .reverse()
                    .find((c) =>
                        s.label
                            ? c.labels.includes(s.label.name)
                            : s.kind === "Break"
                              ? c.unlabelledBreak
                              : c.next !== undefined,
                    );
                if (!target)
                    throw internalError(
                        "lower",
                        "Missing validated control target",
                        s.span,
                    );
                const targetIndex = this.controls.lastIndexOf(target),
                    exited = this.controls
                        .slice(
                            s.kind === "Break" ? targetIndex : targetIndex + 1,
                        )
                        .reverse()
                        .flatMap((c) =>
                            c.iterator === undefined ? [] : [c.iterator],
                        );
                this.complete(
                    {
                        kind: "jump",
                        target: s.kind === "Break" ? target.stop : target.next!,
                    },
                    target.handlerDepth,
                    target.finalizerDepth,
                    exited,
                );
                break;
            }
            case "Labeled": {
                const names = [...labels, s.label.name];
                let body = s.body;
                while (body.kind === "Labeled") {
                    names.push(body.label.name);
                    body = body.body;
                }
                if (
                    body.kind === "While" ||
                    body.kind === "DoWhile" ||
                    body.kind === "For" ||
                    body.kind === "ForIn" ||
                    body.kind === "ForOf" ||
                    body.kind === "Switch"
                )
                    this.statement(body, names);
                else {
                    const join = this.block();
                    this.controls.push({
                        handlerDepth: this.handlers.length,
                        finalizerDepth: this.finalizers.length,
                        stop: join.id,
                        labels: names,
                        unlabelledBreak: false,
                    });
                    this.statement(body);
                    if (!this.terminated)
                        this.end({ kind: "jump", target: join.id });
                    this.controls.pop();
                    this.select(join);
                }
                break;
            }
            case "Switch": {
                const discriminant = this.expression(s.discriminant),
                    join = this.block();
                this.enterScope(s);
                const bodies = s.cases.map(() => this.block());
                let fallback = join.id;
                for (const [i, c] of s.cases.entries()) {
                    if (!c.test) {
                        fallback = bodies[i]!.id;
                        continue;
                    }
                    const right = this.expression(c.test),
                        condition = this.slot(),
                        next = this.block();
                    this.emit({
                        kind: "binary",
                        dest: condition,
                        operator: "===",
                        left: discriminant,
                        right,
                    });
                    this.end({
                        kind: "branch",
                        condition,
                        yes: bodies[i]!.id,
                        no: next.id,
                    });
                    this.select(next);
                }
                this.end({ kind: "jump", target: fallback });
                this.controls.push({
                    handlerDepth: this.handlers.length,
                    finalizerDepth: this.finalizers.length,
                    stop: join.id,
                    labels,
                    unlabelledBreak: true,
                });
                s.cases.forEach((c, i) => {
                    this.select(bodies[i]!);
                    c.body.forEach((stmt) => this.statement(stmt));
                    if (!this.terminated)
                        this.end({
                            kind: "jump",
                            target: bodies[i + 1]?.id ?? join.id,
                        });
                });
                this.controls.pop();
                this.select(join);
                break;
            }
            case "If": {
                const condition = this.expression(s.test),
                    yes = this.block(),
                    no = this.block(),
                    join = this.block();
                this.end({ kind: "branch", condition, yes: yes.id, no: no.id });
                this.select(yes);
                this.statement(s.consequent);
                if (!this.terminated)
                    this.end({ kind: "jump", target: join.id });
                this.select(no);
                if (s.alternate) this.statement(s.alternate);
                if (!this.terminated)
                    this.end({ kind: "jump", target: join.id });
                this.select(join);
                break;
            }
            case "ForOf": {
                if (s.await) {
                    this.forAwaitOf(s, labels);
                    break;
                }
                if (s.left.kind === "Var" && s.left.declarationKind !== "var")
                    this.enterScope(s);
                const object = this.expression(s.right),
                    iterator = this.slot(),
                    next = this.slot();
                this.emit({ kind: "getIterator", iterator, next, object });
                const cond = this.block(),
                    bodyEntry = this.block(),
                    update = this.block(),
                    join = this.block(),
                    caught = this.block(),
                    error = this.slot(),
                    handlerIndex = this.handlerCount++;
                this.end({ kind: "jump", target: cond.id });
                this.select(cond);
                const key = this.slot(),
                    done = this.slot();
                this.emit({
                    kind: "iteratorStep",
                    dest: key,
                    done,
                    iterator,
                    next,
                });
                this.end({
                    kind: "branch",
                    condition: done,
                    yes: join.id,
                    no: bodyEntry.id,
                });
                this.controls.push({
                    handlerDepth: this.handlers.length,
                    finalizerDepth: this.finalizers.length,
                    stop: join.id,
                    next: update.id,
                    labels,
                    unlabelledBreak: true,
                    iterator,
                });
                this.select(bodyEntry);
                this.emit({
                    kind: "pushHandler",
                    index: handlerIndex,
                    target: caught.id,
                    error,
                    handlerKind: "finally",
                });
                this.handlers.push(caught.id);
                const body = this.block();
                this.end({ kind: "jump", target: body.id });
                this.select(body);
                if (s.left.kind === "Var" && s.left.declarationKind !== "var")
                    this.enterScope(s);
                this.assignLoopTarget(s.left, key);
                this.statement(s.body);
                if (!this.terminated) {
                    this.emit({ kind: "popHandler" });
                    this.end({ kind: "jump", target: update.id });
                }
                this.handlers.pop();
                const rethrow = this.block(),
                    closeFailed = this.block(),
                    closeError = this.slot(),
                    closeIndex = this.handlerCount++;
                this.select(caught);
                this.returnMarkerBranch(error, () =>
                    this.emit({ kind: "iteratorClose", iterator }),
                );
                this.emit({
                    kind: "pushHandler",
                    index: closeIndex,
                    target: closeFailed.id,
                    error: closeError,
                });
                this.handlers.push(closeFailed.id);
                const closing = this.block();
                this.end({ kind: "jump", target: closing.id });
                this.select(closing);
                this.emit({ kind: "iteratorClose", iterator });
                this.emit({ kind: "popHandler" });
                this.end({ kind: "jump", target: rethrow.id });
                this.handlers.pop();
                this.select(closeFailed);
                this.end({ kind: "jump", target: rethrow.id });
                this.select(rethrow);
                this.end({ kind: "throw", value: error });
                this.select(update);
                this.end({ kind: "jump", target: cond.id });
                this.controls.pop();
                this.select(join);
                break;
            }
            case "ForIn": {
                if (s.left.kind === "Var" && s.left.annexBInitializer) {
                    const d = s.left.declarations[0]!;
                    this.write(
                        d.id as A.Identifier,
                        this.expression(d.init!, (d.id as A.Identifier).name),
                    );
                }
                if (s.left.kind === "Var" && s.left.declarationKind !== "var")
                    this.enterScope(s);
                const object = this.expression(s.right),
                    keys = this.slot();
                this.emit({ kind: "forInKeys", dest: keys, object });
                const index = this.slot(),
                    zero = this.constant(0),
                    one = this.constant(1),
                    lengthKey = this.constant("length");
                this.emit({ kind: "copy", dest: index, source: zero });
                const cond = this.block(),
                    body = this.block(),
                    update = this.block(),
                    join = this.block();
                this.end({ kind: "jump", target: cond.id });
                this.select(cond);
                const length = this.slot(),
                    active = this.slot();
                this.emit({
                    kind: "property",
                    operation: "get",
                    dest: length,
                    object: keys,
                    key: lengthKey,
                });
                this.emit({
                    kind: "binary",
                    dest: active,
                    operator: "<",
                    left: index,
                    right: length,
                });
                this.end({
                    kind: "branch",
                    condition: active,
                    yes: body.id,
                    no: join.id,
                });
                this.controls.push({
                    handlerDepth: this.handlers.length,
                    finalizerDepth: this.finalizers.length,
                    stop: join.id,
                    next: update.id,
                    labels,
                    unlabelledBreak: true,
                });
                this.select(body);
                const key = this.slot();
                this.emit({
                    kind: "property",
                    operation: "get",
                    dest: key,
                    object: keys,
                    key: index,
                });
                const present = this.slot(),
                    yieldBody = this.block();
                this.emit({ kind: "forInHas", dest: present, object, key });
                this.end({
                    kind: "branch",
                    condition: present,
                    yes: yieldBody.id,
                    no: update.id,
                });
                this.select(yieldBody);
                if (s.left.kind === "Var" && s.left.declarationKind !== "var")
                    this.enterScope(s);
                this.assignLoopTarget(s.left, key);
                this.statement(s.body);
                if (!this.terminated)
                    this.end({ kind: "jump", target: update.id });
                this.select(update);
                const next = this.slot();
                this.emit({
                    kind: "binary",
                    dest: next,
                    operator: "+",
                    left: index,
                    right: one,
                });
                this.emit({ kind: "copy", dest: index, source: next });
                this.end({ kind: "jump", target: cond.id });
                this.controls.pop();
                this.select(join);
                break;
            }
            case "While":
            case "DoWhile":
            case "For": {
                if (s.kind === "For") this.enterScope(s);
                if (s.kind === "For" && s.init) {
                    if (s.init.kind === "Var") this.statement(s.init);
                    else this.expression(s.init);
                }
                if (s.kind === "For") this.cloneIteration(s);
                const cond = this.block(),
                    body = this.block(),
                    update = this.block(),
                    join = this.block();
                this.end({
                    kind: "jump",
                    target: s.kind === "DoWhile" ? body.id : cond.id,
                });
                this.select(cond);
                if (s.test)
                    this.end({
                        kind: "branch",
                        condition: this.expression(s.test),
                        yes: body.id,
                        no: join.id,
                    });
                else this.end({ kind: "jump", target: body.id });
                this.controls.push({
                    handlerDepth: this.handlers.length,
                    finalizerDepth: this.finalizers.length,
                    stop: join.id,
                    next: s.kind === "For" ? update.id : cond.id,
                    labels,
                    unlabelledBreak: true,
                });
                this.select(body);
                this.statement(s.body);
                if (!this.terminated)
                    this.end({ kind: "jump", target: update.id });
                this.select(update);
                if (s.kind === "For") {
                    this.cloneIteration(s);
                    if (s.update) this.expression(s.update);
                }
                this.end({ kind: "jump", target: cond.id });
                this.controls.pop();
                this.select(join);
                break;
            }
        }
    }
}
