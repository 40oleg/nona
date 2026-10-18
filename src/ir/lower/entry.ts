import type * as A from "../../frontend/ast.js";
import type { FunctionIR } from "../model.js";
import { importMetaFields } from "./expressions.js";
import { AssignmentCallLowerer } from "./assignment-calls.js";

/** The entry points of a function, a module body and a module namespace. */
export abstract class EntryLowerer extends AssignmentCallLowerer {
    /** Materialize a namespace only when its evaluation graph is requested. */
    namespaceFunction(): FunctionIR {
        const module = this.bound.modules![this.moduleIndex!]!;
        this.enterScope(module.record.ast);
        for (const fn of this.bound.declarations)
            if (fn.module === module.record.index)
                this.store(this.binding(fn.declaration.id!), this.closure(fn));
        const meta = importMetaFields(module.record.path);
        this.store(
            module.meta,
            this.preludeCall(
                "createImportMeta",
                meta
                    ? [
                          this.constant(meta.url),
                          this.constant(meta.filename),
                          this.constant(meta.dirname),
                      ]
                    : [],
            ),
        );
        const names = this.arrayOf(
            module.exportNames.map((name) => this.constant(name)),
        );
        const getters = this.arrayOf(
            module.getters.map((getter) => this.closure(getter, "")),
        );
        this.store(
            module.namespace,
            this.preludeCall("createNamespace", [names, getters]),
        );
        this.end({ kind: "return", value: this.readStorage(module.namespace) });
        return {
            id: `js.namespace.${module.record.index}`,
            name: "<namespace>",
            parameterCount: 0,
            localCount: 0,
            slotCount: this.slots,
            maxArguments: this.maxArguments,
            handlerCount: 0,
            derivedConstructor: false,
            generator: false,
            blocks: this.blocks,
        };
    }
    /** Register graph factories before evaluating any module. */
    protected moduleMain(): void {
        const modules = this.bound.modules!;
        for (const module of modules) {
            const body = this.slot();
            // A body with top-level await is an async function: its call
            // returns the promise of the evaluation.
            const topLevelAwait = module.record.ast.topLevelAwait === true;
            this.emit({
                kind: "newFunction",
                strict: true,
                dest: body,
                ...(topLevelAwait ? { async: true } : {}),
                target: `js.module.${module.record.index}`,
                captures: [],
                parameterCount: 0,
                name: "",
            });
            const namespaceFactory = this.slot();
            this.emit({
                kind: "newFunction",
                strict: true,
                dest: namespaceFactory,
                target: `js.namespace.${module.record.index}`,
                captures: [],
                parameterCount: 0,
                name: "",
            });
            const requests = this.arrayOf(
                module.record.staticRequests.map((index) =>
                    this.constant(index),
                ),
            );
            const specifiers = this.arrayOf(
                [...module.record.requests.keys()].map((key) =>
                    this.constant(key),
                ),
            );
            const targets = this.arrayOf(
                [...module.record.requests.values()].map((index) =>
                    this.constant(index),
                ),
            );
            const builtinAliases = this.arrayOf(
                (module.record.builtinAliases ?? []).map((alias) =>
                    this.constant(alias),
                ),
            );
            this.preludeCall("registerModule", [
                this.constant(module.record.index),
                this.constant(module.record.path),
                body,
                requests,
                this.constant(undefined),
                specifiers,
                targets,
                module.linkError === undefined
                    ? this.constant(undefined)
                    : this.constant(module.linkError),
                builtinAliases,
                namespaceFactory,
                ...(topLevelAwait ? [this.constant(true)] : []),
            ]);
        }
        const script = this.bound.ast;
        if (!script.module) {
            const specifiers = this.arrayOf(
                (script.scriptRequests ?? []).map(([specifier]) =>
                    this.constant(specifier),
                ),
            );
            const targets = this.arrayOf(
                (script.scriptRequests ?? []).map(([, index]) =>
                    this.constant(index),
                ),
            );
            this.preludeCall("registerScript", [
                this.constant(script.scriptPath ?? ""),
                specifiers,
                targets,
            ]);
        }
    }
    run(body: A.Statement[]): FunctionIR {
        for (const [index, binding] of (this.fn?.captures ?? []).entries()) {
            const dest = this.slot();
            this.captureSlots.set(binding, dest);
            this.emit({ kind: "loadCapture", dest, index });
        }
        const needsInitialization =
                !!this.fn &&
                (!!this.fn.declaration.defaults?.some(Boolean) ||
                    this.fn.declaration.parameters.some(
                        (p) => p.kind !== "Identifier",
                    ) ||
                    (!!this.fn.declaration.rest &&
                        this.fn.declaration.rest.kind !== "Identifier")),
            incoming: number[] = [];
        if (needsInitialization) {
            // Preserve the call arguments while all parameter bindings start in TDZ.
            // Each binding is initialized only when its position is reached below.
            for (const parameter of this.fn!.parameters) {
                const copy = this.slot();
                this.emit({
                    kind: "copy",
                    dest: copy,
                    source: parameter.index,
                });
                incoming.push(copy);
            }
            const uninitialized = this.slot();
            this.emit({ kind: "uninitialized", dest: uninitialized });
            for (const parameter of this.fn!.locals)
                if (parameter.kind === "parameter")
                    this.emit({
                        kind: "copy",
                        dest: parameter.index,
                        source: uninitialized,
                    });
        }
        for (const binding of this.fn?.locals ?? this.bound.mainLocals)
            if (
                binding.captured &&
                !binding.lexical &&
                binding !== this.fn?.self &&
                !this.capturedByValue(binding)
            ) {
                const source =
                    binding.kind === "parameter"
                        ? binding.index
                        : this.constant(undefined);
                this.emit({ kind: "newCell", dest: binding.index, source });
            }
        if (this.fn?.self) {
            const self = this.fn.self,
                source = this.slot();
            this.emit({ kind: "currentFunction", dest: source });
            if (self.captured)
                this.emit({ kind: "newCell", dest: self.index, source });
            else this.emit({ kind: "copy", dest: self.index, source });
        }
        if (this.fn?.argumentsBinding) {
            const last = new Map(this.fn.parameters.map((p) => [p.name, p]));
            const unmapped =
                !!this.fn.restParameter ||
                !!this.fn.declaration.defaults?.some(Boolean) ||
                this.fn.declaration.parameters.some(
                    (id) => id.kind !== "Identifier",
                );
            const dest = this.slot();
            this.emit({
                kind: "newArguments",
                dest,
                ...(unmapped ? { unmapped: true } : {}),
                parameters: this.fn.parameters.map((p) =>
                    !this.fn!.strict &&
                    !this.fn!.restParameter &&
                    !this.fn!.declaration.defaults?.some(Boolean) &&
                    this.fn!.declaration.parameters.every(
                        (id) => id.kind === "Identifier",
                    ) &&
                    last.get(p.name) === p
                        ? this.cellSlot(p)
                        : -1,
                ),
            });
            this.store(this.fn.argumentsBinding, dest);
        }
        // A base class constructor initializes its instance elements first (ES2022 [[Construct]] step 6.b).
        if (
            this.fn?.declaration.kind === "FunctionExpression" &&
            this.fn.declaration.instanceFields &&
            !this.fn.declaration.derivedConstructor
        )
            this.initializeInstance(
                this.currentThis(),
                this.fn.declaration.instanceFields,
            );
        if (needsInitialization) {
            for (const [
                index,
                pattern,
            ] of this.fn!.declaration.parameters.entries()) {
                const init = this.fn!.declaration.defaults?.[index];
                if (!init) {
                    this.bindPattern(pattern, incoming[index]!, true);
                    continue;
                }
                const undefinedValue = this.constant(undefined),
                    condition = this.slot();
                this.emit({
                    kind: "binary",
                    dest: condition,
                    operator: "===",
                    left: incoming[index]!,
                    right: undefinedValue,
                });
                const initialize = this.block(),
                    provided = this.block(),
                    next = this.block();
                this.end({
                    kind: "branch",
                    condition,
                    yes: initialize.id,
                    no: provided.id,
                });
                this.select(initialize);
                this.bindPattern(pattern, this.expression(init), true);
                this.end({ kind: "jump", target: next.id });
                this.select(provided);
                this.bindPattern(pattern, incoming[index]!, true);
                this.end({ kind: "jump", target: next.id });
                this.select(next);
            }
        }
        if (this.fn?.restParameter) {
            const dest = this.slot();
            this.emit({
                kind: "newRestArray",
                dest,
                start: this.fn.parameters.length,
            });
            this.bindPattern(this.fn.declaration.rest!, dest, true);
        }
        const moduleBody =
            this.moduleIndex !== undefined && this.moduleIndex >= 0;
        if (!moduleBody)
            this.enterScope(this.fn?.declaration.body ?? this.bound.ast);
        for (const fn of moduleBody
            ? []
            : (this.fn?.declarations ?? this.bound.declarations)) {
            if (this.moduleIndex === -1 && fn.module !== undefined) continue;
            const binding = this.binding(fn.declaration.id!),
                source = this.closure(fn);
            // Script declarations replace configurable host globals after the
            // runtime prelude, with writable, enumerable, nonconfigurable data properties.
            if (binding.kind === "globalProperty")
                this.emit({
                    kind: "defineDataProperty",
                    object: this.globalObject(),
                    key: this.constant(binding.name),
                    source,
                    attributes: 3,
                });
            else this.store(binding, source);
        }
        if (this.fn?.declaration.generator)
            this.emit({ kind: "generatorInitialSuspend" });
        if (
            this.fn?.declaration.kind === "FunctionExpression" &&
            this.fn.declaration.derivedConstructor
        ) {
            for (const binding of this.fn.locals)
                if (
                    binding.name === "#superFunction" ||
                    binding.name === "#superReceiver"
                ) {
                    const value = this.slot();
                    this.emit(
                        binding.name === "#superFunction"
                            ? { kind: "currentFunction", dest: value }
                            : { kind: "superReceiver", dest: value },
                    );
                    this.store(binding, value);
                }
        }
        if (
            this.fn?.declaration.kind === "FunctionExpression" &&
            this.fn.declaration.derivedConstructor &&
            this.fn.declaration.defaultClassConstructor
        ) {
            // super(...args) passes the arguments on as they are: no rest array
            // and no iteration of it (the spread of an own rest array is not observable).
            const base = this.slot(),
                receiver = this.slot(),
                result = this.slot(),
                dest = this.slot();
            this.emit({ kind: "superConstructor", dest: base });
            this.emit({ kind: "superReceiver", dest: receiver });
            const target = this.slot();
            this.emit({ kind: "newTarget", dest: target });
            this.emit({
                kind: "constructForward",
                dest: result,
                callee: base,
                receiver,
                newTarget: target,
            });
            this.emit({
                kind: "constructorResult",
                dest,
                result,
                instance: receiver,
            });
            if (this.fn.declaration.instanceFields)
                this.initializeInstance(
                    dest,
                    this.fn.declaration.instanceFields,
                );
            this.end({ kind: "return", value: dest });
        }
        if (this.moduleIndex === -1) this.moduleMain();
        body.forEach((s) => this.statement(s));
        if (
            this.moduleIndex === -1 &&
            this.bound.ast.module &&
            !this.terminated
        )
            this.preludeCall("evaluateModule", [this.constant(0)]);
        // A derived constructor that falls off its end returns its `this`; the
        // ReferenceError of one never initialized is the caller's (derivedReturn).
        if (
            !this.terminated &&
            this.fn?.declaration.kind === "FunctionExpression" &&
            this.fn.declaration.derivedConstructor
        ) {
            const checked = this.slot();
            this.emit({
                kind: "derivedReturn",
                dest: checked,
                source: this.constant(undefined),
            });
            this.end({ kind: "return", value: checked });
        }
        if (!this.terminated)
            this.end({ kind: "return", value: this.constant(undefined) });
        return {
            id: this.fn
                ? `${this.fn.realmLocal ? "js.rfn" : "js.fn"}.${this.fn.index}`
                : this.moduleIndex !== undefined && this.moduleIndex >= 0
                  ? `js.module.${this.moduleIndex}`
                  : "js.main",
            name:
                this.fn?.declaration.id?.name ??
                (this.fn ? "<anonymous>" : "<main>"),
            parameterCount: this.fn?.parameters.length ?? 0,
            localCount: this.fn?.locals.length ?? this.bound.mainLocals.length,
            slotCount: this.slots,
            maxArguments: this.maxArguments,
            handlerCount: this.handlerCount,
            derivedConstructor:
                this.fn?.declaration.kind === "FunctionExpression" &&
                this.fn.declaration.derivedConstructor === true,
            generator:
                this.fn?.declaration.generator === true ||
                this.fn?.declaration.async === true ||
                (moduleBody &&
                    this.bound.modules![this.moduleIndex!]!.record.ast
                        .topLevelAwait === true),
            blocks: this.blocks,
        };
    }
}
