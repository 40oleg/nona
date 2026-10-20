import type * as A from "../frontend/ast.js";
import type { BoundProgram } from "../frontend/bound.js";
import type { FfiDeclarationIR, ModuleIR } from "./model.js";
import { internalError } from "../diagnostics.js";
import { annotateDirectCalls } from "./calls.js";
import { inlineDirectCalls } from "./inline.js";
import { optimizeFunction } from "./optimize.js";
import { initializedCaptures } from "./initialization.js";
import { EntryLowerer } from "./lower/entry.js";
export { importMetaFields } from "./lower/expressions.js";

export interface LowerOptions {
    /** Inline small known callees (src/ir/inline.ts); off for coverage and call statistics, which count calls. */
    inline?: boolean;
}

export function lower(
    bound: BoundProgram,
    options: LowerOptions = {},
): ModuleIR {
    const templateCaches = {
        next: bound.globals.length,
        ffi: [] as FfiDeclarationIR[],
    };
    const functions = [
        new Lowerer(
            bound,
            null,
            templateCaches,
            bound.modules ? -1 : undefined,
        ).run(bound.ast.body),
    ];
    for (const module of bound.modules ?? [])
        functions.push(
            new Lowerer(bound, null, templateCaches, module.record.index).run(
                module.record.ast.body,
            ),
        );
    for (const module of bound.modules ?? [])
        functions.push(
            new Lowerer(
                bound,
                null,
                templateCaches,
                module.record.index,
            ).namespaceFunction(),
        );
    // Source ranges for coverage (V8 reports the script itself as an unnamed function).
    if (!bound.modules)
        functions[0] = {
            ...functions[0]!,
            source: { script: 0, name: "", start: 0, end: bound.ast.span.end },
        };
    (bound.modules ?? []).forEach((module, i) => {
        functions[i + 1] = {
            ...functions[i + 1]!,
            source: {
                script: module.record.index + 1,
                name: "",
                start: 0,
                end: module.record.ast.span.end,
            },
        };
    });
    for (const f of bound.functions) {
        const lowered = new Lowerer(bound, f, templateCaches).run(
            f.declaration.body.body,
        );
        functions.push({
            ...lowered,
            source: {
                script: f.module === undefined ? 0 : f.module + 1,
                name: lowered.name.startsWith("<") ? "" : lowered.name,
                start: f.declaration.span.start,
                end: f.declaration.span.end,
            },
        });
    }
    // Names as V8 reports them: the name given where the function is created
    // (declarations, `const f = () => …`, classes), a method's literal key, and
    // a get/set prefix for accessors.
    const names = new Map<string, string>();
    for (const fn of functions)
        for (const block of fn.blocks) {
            const constants = new Map<number, string>(),
                created = new Map<number, string>();
            for (const op of block.operations) {
                if (op.kind === "constant" && typeof op.value === "string")
                    constants.set(op.dest, op.value);
                else if (
                    (op.kind === "copy" ||
                        (op.kind === "unary" &&
                            op.operator === "propertyKey")) &&
                    constants.has(op.kind === "copy" ? op.source : op.argument)
                )
                    constants.set(
                        op.dest,
                        constants.get(
                            op.kind === "copy" ? op.source : op.argument,
                        )!,
                    );
                if (op.kind === "newFunction") {
                    const name =
                        op.name !== undefined && op.name !== ""
                            ? op.name
                            : op.nameSlot !== undefined
                              ? constants.get(op.nameSlot)
                              : undefined;
                    if (name !== undefined && !names.has(op.target))
                        names.set(op.target, name);
                    created.set(op.dest, op.target);
                }
                if (op.kind === "defineAccessor" && created.has(op.source)) {
                    const target = created.get(op.source)!,
                        name = names.get(target);
                    if (name !== undefined)
                        names.set(target, (op.setter ? "set " : "get ") + name);
                }
            }
        }
    for (const [i, fn] of functions.entries())
        if (fn.source && fn.source.name === "" && names.has(fn.id))
            functions[i] = {
                ...fn,
                source: { ...fn.source, name: names.get(fn.id)! },
            };
    const captures = initializedCaptures(functions);
    const module = annotateDirectCalls({
        ...(templateCaches.ffi.length ? { ffi: templateCaches.ffi } : {}),
        scripts: [
            "",
            ...(bound.modules ?? []).map((module) => module.record.path),
        ],
        globalCount: templateCaches.next,
        functions: functions.map((fn) => optimizeFunction(fn, captures)),
        globalProperties: bound.globals
            .filter((b) => !b.lexical && !b.module)
            .map(({ name, index }) => ({ name, index })),
    });
    return options.inline ? inlineDirectCalls(module, { captures }) : module;
}

/** Expression dispatch; the final class of the lowering chain. */
class Lowerer extends EntryLowerer {
    protected expression(
        e: A.Expression,
        inferredName?: string | number,
    ): number {
        switch (e.kind) {
            case "NewTarget":
                return this.lowerNewTarget(e);
            case "Super":
                throw internalError("lower", "Bare super", e.span);
            case "This":
                return this.lowerThis(e);
            case "ImportMeta":
                return this.lowerImportMeta(e);
            case "ImportCall":
                return this.lowerImportCall(e);
            case "Literal":
                return this.constant(e.value);
            case "RegExpLiteral":
                return this.lowerRegExpLiteral(e);
            case "Yield":
                return this.lowerYield(e);
            case "Await":
                return this.lowerAwait(e);
            case "TaggedTemplate":
                return this.lowerTaggedTemplate(e);
            case "Template":
                return this.lowerTemplate(e);
            case "Identifier":
                return this.read(e);
            case "ClassExpression":
                return this.classValue(e, inferredName);
            case "PrivateName":
                throw internalError("lower", "Unexpected private name", e.span);
            case "ClassFieldDefinition":
                return this.classFieldDefinition(e);
            case "FunctionExpression":
                return this.closure(
                    this.bound.functionNodes.get(e)!,
                    inferredName,
                );
            case "Member":
                return this.getReference(this.reference(e));
            case "OptionalChain":
                return this.optionalChain(e, "value");
            case "ObjectLiteral":
            case "ArrayLiteral":
                return this.lowerObjectOrArrayLiteral(e);
            case "Unary":
                return this.lowerUnary(e);
            case "Update":
                return this.lowerUpdate(e);
            case "Assignment":
                return this.lowerAssignment(e);
            case "New":
                return this.lowerNew(e);
            case "Call":
                return this.lowerCall(e);
            case "Binary":
                return this.lowerBinary(e);
            case "Conditional":
                return this.lowerConditional(e);
        }
    }
}
