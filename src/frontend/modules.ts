import { lowerDynamicFunctions } from "./dynamic-functions.js";
import { lowerLiteralEval } from "./eval-aot.js";
import { boundNames, collectDeclarations } from "./declarations.js";
import { CompileError } from "../diagnostics.js";
import type * as A from "./ast.js";
import {
    collectSourceUsage,
    lex,
    requireRuntimePrelude,
    type LinkReasons,
    type SourceUsage,
} from "./lexer.js";
import { parse } from "./parser.js";

/** A parsed module in the statically known graph. Index 0 is the entry. */
export interface ModuleRecord {
    index: number;
    path: string;
    ast: A.Program;
    /** Parse error of a module loaded for import(); reported when that import runs. */
    loadError?: string;
    /** Specifier text -> index of the resolved module, for static and literal dynamic requests. */
    requests: Map<string, number>;
    /** Modules this one imports statically, in source order (for evaluation). */
    staticRequests: number[];
    /** Exact registry names for an implemented builtin; absent for user modules. */
    builtinAliases?: string[];
    /** Modules reached by a request that is not a static import or export (import(), builtin lookups). */
    dynamicRequests: number[];
    /** A builtin's source usage, kept out of the program's until its unused code is pruned (builtin-pruning.ts). */
    deferredUsage?: { usage: SourceUsage; reasons: LinkReasons };
}

/** Host hooks. Paths are canonical, '/'-separated strings chosen by the host. */
export interface ModuleHost {
    resolve(specifier: string, referrer: string): string | undefined;
    read(path: string): string | undefined;
    /** Specifiers a computed import() in the referrer may name; these modules are compiled in. */
    candidates?(referrer: string): string[];
    builtinAliases?(path: string): string[] | undefined;
    builtinCandidates?(): string[];
    /** A module the host builds as an AST rather than text (a CommonJS factory, src/frontend/commonjs.ts). */
    program?(path: string): A.Program | undefined;
}

function fail(message: string, path: string, node?: A.Node): never {
    throw new CompileError([
        {
            code: "E_MODULE",
            message,
            file: path,
            span: node?.span ?? { start: 0, end: 0 },
        },
    ]);
}

/** Relative specifier resolution over canonical '/'-rooted paths; the runtime mirrors it. */
export function resolveRelative(
    specifier: string,
    referrer: string,
): string | undefined {
    if (
        !specifier.startsWith("./") &&
        !specifier.startsWith("../") &&
        !specifier.startsWith("/")
    )
        return undefined;
    const parts = specifier.startsWith("/")
        ? []
        : referrer.split("/").slice(1, -1);
    for (const segment of specifier.split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === "..") parts.pop();
        else parts.push(segment);
    }
    return "/" + parts.join("/");
}

function walk(
    node: unknown,
    visit: (node: A.Node, parent?: A.Node) => void,
    parent?: A.Node,
): void {
    const pending: [unknown, A.Node | undefined][] = [[node, parent]];
    while (pending.length) {
        const [value, outer] = pending.pop()!;
        if (Array.isArray(value)) {
            for (let index = value.length - 1; index >= 0; index--)
                pending.push([value[index], outer]);
            continue;
        }
        if (!value || typeof value !== "object") continue;
        const record = value as Record<string, unknown>;
        const current =
            typeof record.kind === "string" && typeof record.span === "object"
                ? (record as unknown as A.Node)
                : outer;
        if (current !== outer) visit(current!, outer);
        // Reverse the work stack to preserve the recursive walk's source order.
        const entries = Object.entries(record);
        for (let index = entries.length - 1; index >= 0; index--) {
            const [key, child] = entries[index]!;
            if (key !== "span" && key !== "source")
                pending.push([child, current]);
        }
    }
}

/** Plan only user AST requests; provider exports must not recursively select inventory. */
export function builtinModuleRequests(
    ast: Pick<A.Program, "body">,
    host: ModuleHost,
): string[] {
    const literals = new Set<string>(),
        processNames = new Set(["process"]),
        globalNames = new Set(["globalThis"]),
        getterNames = new Set<string>();
    let computed = false,
        lookup = false;
    // Discovery happens before binding. Track lexical/var scopes so a local
    // fetch (or a property named fetch) cannot select the networking provider.
    const parents = new Map<A.Node, A.Node | undefined>();
    walk(ast.body, (node, parent) => parents.set(node, parent));
    const hasFetchIdentifier = [...parents.keys()].some(
        (node) =>
            node.kind === "Identifier" &&
            (node as A.Identifier).name === "fetch",
    );
    const fetchShadows: A.Node[] = [];
    const shadows = (pattern: A.BindingPattern | null | undefined) =>
        !!pattern && boundNames(pattern).some((id) => id.name === "fetch");
    const declaresFetch = (body: A.Statement[], vars: boolean) => {
        if (!hasFetchIdentifier) return false;
        const declarations = collectDeclarations(
            body,
            vars ? "var" : "lexical",
        );
        return (
            declarations.lexicals.some((d) => d.name === "fetch") ||
            (vars &&
                (declarations.vars.some((id) => id.name === "fetch") ||
                    declarations.bodyFunctions.some(
                        (fn) => fn.id.name === "fetch",
                    )))
        );
    };
    const rootDeclarations = hasFetchIdentifier
        ? collectDeclarations(ast.body, "var")
        : { vars: [], lexicals: [], bodyFunctions: [] };
    // Script var declarations share the global property: their initializers
    // may read fetch before replacing it, or never execute (e.g. in a branch).
    // Module vars, like function-local vars, really shadow the global instead.
    const rootShadow =
        ((ast as A.Program).module &&
            rootDeclarations.vars.some((id) => id.name === "fetch")) ||
        rootDeclarations.lexicals.some((d) => d.name === "fetch") ||
        rootDeclarations.bodyFunctions.some((fn) => fn.id.name === "fetch") ||
        ast.body.some(
            (node) =>
                node.kind === "Import" &&
                node.specifiers.some((s) => s.local.name === "fetch"),
        );
    const bindingIds = new Set<A.Identifier>();
    // Resolve keys through the nearest declaration, not a file-wide name count.
    // A nonconstant inner binding must also hide an outer constant.
    const scopeBindings = new Map<
        A.Node | undefined,
        Map<string, A.Identifier>
    >();
    const enclosingScope = (node: A.Node, vars = false) => {
        for (let outer = parents.get(node); outer; outer = parents.get(outer)) {
            if (
                vars &&
                (outer.kind === "Function" ||
                    outer.kind === "FunctionExpression")
            )
                return (outer as A.FunctionNode).body;
            if (
                !vars &&
                ["Block", "For", "ForIn", "ForOf", "Switch"].includes(
                    outer.kind,
                )
            )
                return outer;
        }
        return undefined;
    };
    const remember = (
        pattern: A.BindingPattern | null | undefined,
        scope: A.Node | undefined,
    ) => {
        if (!pattern) return;
        let bindings = scopeBindings.get(scope);
        if (!bindings) scopeBindings.set(scope, (bindings = new Map()));
        for (const id of boundNames(pattern)) {
            bindingIds.add(id);
            bindings.set(id.name, id);
        }
    };
    walk(ast.body, (node) => {
        if (node.kind === "Var")
            for (const d of (node as A.Var).declarations)
                remember(
                    d.id,
                    enclosingScope(
                        node,
                        (node as A.Var).declarationKind === "var",
                    ),
                );
        if (
            node.kind === "Block" &&
            declaresFetch((node as A.Block).body, false)
        )
            fetchShadows.push(node);
        if (node.kind === "Function" || node.kind === "FunctionExpression") {
            const fn = node as A.FunctionNode;
            remember(
                fn.id,
                node.kind === "FunctionExpression"
                    ? node
                    : enclosingScope(node),
            );
            fn.parameters.forEach((parameter) => remember(parameter, node));
            remember(fn.rest, node);
            if (
                shadows(fn.id) ||
                fn.parameters.some(shadows) ||
                shadows(fn.rest)
            )
                fetchShadows.push(node);
            // Body vars are outside the parameter-default environment.
            if (declaresFetch(fn.body.body, true)) fetchShadows.push(fn.body);
        } else if (node.kind === "Try") {
            const clause = node as A.Try;
            remember(clause.parameter, clause.handler ?? undefined);
            if (shadows(clause.parameter) && clause.handler)
                fetchShadows.push(clause.handler);
        } else if (node.kind === "Switch") {
            if (
                declaresFetch(
                    (node as A.Switch).cases.flatMap((clause) => clause.body),
                    false,
                )
            )
                for (const clause of (node as A.Switch).cases) {
                    if (clause.test) fetchShadows.push(clause.test);
                    fetchShadows.push(...clause.body);
                }
        } else if (["For", "ForIn", "ForOf"].includes(node.kind)) {
            const loop = node as A.For | A.ForIn | A.ForOf;
            const declaration = loop.kind === "For" ? loop.init : loop.left;
            if (
                declaration?.kind === "Var" &&
                declaration.declarationKind !== "var" &&
                declaration.declarations.some((d) => shadows(d.id))
            )
                fetchShadows.push(node);
        } else if (node.kind === "ClassExpression" || node.kind === "Class") {
            remember(
                (node as A.ClassExpression).id,
                node.kind === "ClassExpression" ? node : enclosingScope(node),
            );
            if (
                node.kind === "ClassExpression" &&
                shadows((node as A.ClassExpression).id)
            )
                fetchShadows.push(node);
        } else if (node.kind === "Import")
            for (const s of (node as A.ImportDeclaration).specifiers)
                remember(s.local, undefined);
    });
    const fetchReference = (node: A.Node) => {
        if (rootShadow || bindingIds.has(node as A.Identifier)) return false;
        for (
            let outer: A.Node | undefined = node;
            outer;
            outer = parents.get(outer)
        )
            if (fetchShadows.includes(outer)) return false;
        const parent = parents.get(node);
        if (
            parent?.kind === "ObjectLiteral" &&
            (parent as A.ObjectLiteral).properties.some(
                (p) =>
                    "key" in p &&
                    p.key === node &&
                    !p.computed &&
                    p.value !== node,
            )
        )
            return false;
        return parent?.kind !== "Import";
    };
    const constantStrings = new Map<A.Identifier, string>();
    const text = (expression: A.Expression): string | undefined => {
        if (expression.kind === "Identifier") {
            for (
                let child: A.Node = expression, outer = parents.get(child);
                ;
                child = outer!, outer = parents.get(outer!)
            ) {
                // The discriminant evaluates before the case lexical
                // environment is created; case tests evaluate inside it.
                if (
                    outer?.kind === "Switch" &&
                    (outer as A.Switch).discriminant === child
                )
                    continue;
                const binding = scopeBindings.get(outer)?.get(expression.name);
                if (binding) return constantStrings.get(binding);
                if (!outer) return undefined;
            }
        }
        if (
            expression.kind === "Literal" &&
            typeof expression.value === "string"
        )
            return expression.value;
        if (expression.kind === "Template" && !expression.expressions.length)
            return expression.quasis[0];
        if (expression.kind === "Binary" && expression.operator === "+") {
            const left = text(expression.left),
                right = text(expression.right);
            if (left !== undefined && right !== undefined) return left + right;
        }
        return undefined;
    };
    // Resolve immutable string keys without selecting the entire builtin
    // inventory for common computed global access, e.g. const key = 'fetch'.
    walk(ast.body, (node) => {
        if (node.kind !== "Var" || (node as A.Var).declarationKind !== "const")
            return;
        for (const declaration of (node as A.Var).declarations) {
            if (declaration.id.kind !== "Identifier" || !declaration.init)
                continue;
            const value = text(declaration.init);
            if (value !== undefined) constantStrings.set(declaration.id, value);
        }
    });
    for (const statement of ast.body)
        if (
            statement.kind === "Import" &&
            ["process", "node:process", "nona:process"].includes(
                statement.source,
            )
        )
            for (const specifier of statement.specifiers) {
                if (
                    specifier.kind === "named" &&
                    specifier.imported === "getBuiltinModule"
                )
                    getterNames.add(specifier.local.name);
                else if (
                    specifier.kind === "default" ||
                    specifier.kind === "namespace"
                )
                    processNames.add(specifier.local.name);
            }
    const globalObject = (expression: A.Expression) =>
        expression.kind === "Identifier" && globalNames.has(expression.name);
    const processObject = (expression: A.Expression): boolean => {
        if (expression.kind === "Identifier")
            return processNames.has(expression.name);
        if (expression.kind === "Member")
            return (
                globalObject(expression.object) &&
                text(expression.property) === "process"
            );
        if (expression.kind === "Call") {
            const first = expression.arguments[0],
                key = expression.arguments[1],
                callee = expression.callee;
            if (
                callee.kind === "Member" &&
                text(callee.property) === "get" &&
                first?.kind !== "SpreadElement" &&
                first &&
                globalObject(first) &&
                key?.kind !== "SpreadElement" &&
                key &&
                text(key) === "process"
            )
                return true;
            if (
                first?.kind !== "SpreadElement" &&
                first &&
                ["process", "node:process", "nona:process"].includes(
                    text(first) ?? "",
                )
            )
                return (
                    (callee.kind === "Member" &&
                        text(callee.property) === "getBuiltinModule") ||
                    (callee.kind === "Identifier" &&
                        getterNames.has(callee.name))
                );
        }
        return false;
    };
    const getterObject = (expression: A.Expression): boolean =>
        (expression.kind === "Identifier" &&
            getterNames.has(expression.name)) ||
        (expression.kind === "Member" &&
            processObject(expression.object) &&
            text(expression.property) === "getBuiltinModule");
    const getterDeclaration = (
        parent: A.Node | undefined,
        node: A.Node,
    ): boolean =>
        parent?.kind === "Var" &&
        (parent as A.Var).declarationKind === "const" &&
        (parent as A.Var).declarations.some(
            (d) =>
                d.id.kind === "Identifier" &&
                getterNames.has(d.id.name) &&
                (d.id === node || d.init === node),
        );
    // An immutable descriptor inspected only for identity or member types cannot
    // invoke its getter. Any escape, reassignment or callable use stays conservative.
    const observedDescriptors = new Set<A.Call>();
    walk(ast.body, (node) => {
        if (node.kind !== "Var" || (node as A.Var).declarationKind !== "const")
            return;
        for (const declaration of (node as A.Var).declarations) {
            if (
                declaration.id.kind !== "Identifier" ||
                declaration.init?.kind !== "Call"
            )
                continue;
            const call = declaration.init,
                callee = call.callee,
                object = call.arguments[0],
                key = call.arguments[1];
            if (
                callee.kind !== "Member" ||
                callee.object.kind !== "Identifier" ||
                callee.object.name !== "Object" ||
                text(callee.property) !== "getOwnPropertyDescriptor" ||
                !object ||
                object.kind === "SpreadElement" ||
                !globalObject(object) ||
                !key ||
                key.kind === "SpreadElement" ||
                text(key) !== "process"
            )
                continue;
            const name = declaration.id.name;
            let safe = true;
            walk(ast.body, (use, parent) => {
                if (
                    use.kind !== "Identifier" ||
                    (use as A.Identifier).name !== name ||
                    use === declaration.id
                )
                    return;
                if (
                    parent?.kind === "Unary" &&
                    (parent as A.Unary).operator === "typeof"
                )
                    return;
                if (parent?.kind === "Binary") {
                    const binary = parent as A.Binary,
                        other =
                            binary.left === use ? binary.right : binary.left;
                    if (
                        ["===", "!==", "==", "!="].includes(binary.operator) &&
                        other.kind === "Identifier" &&
                        other.name === "undefined"
                    )
                        return;
                }
                if (
                    parent?.kind === "Member" &&
                    (parent as A.Member).object === use
                ) {
                    let typeOnly = false;
                    walk(ast.body, (member, owner) => {
                        if (
                            member === parent &&
                            owner?.kind === "Unary" &&
                            (owner as A.Unary).operator === "typeof"
                        )
                            typeOnly = true;
                    });
                    if (typeOnly) return;
                }
                safe = false;
            });
            if (safe) observedDescriptors.add(call);
        }
    });
    // Follow simple object aliases so computed access through them is conservative.
    let changed = true;
    while (changed) {
        changed = false;
        walk(ast.body, (node) => {
            const add = (id: A.Expression, init: A.Expression | null) => {
                if (id.kind !== "Identifier" || !init) return;
                for (const [matches, names] of [
                    [processObject(init), processNames],
                    [globalObject(init), globalNames],
                ] as const)
                    if (matches && !names.has(id.name)) {
                        names.add(id.name);
                        changed = true;
                    }
            };
            if (node.kind === "Var") {
                for (const declaration of (node as A.Var).declarations)
                    if (declaration.id.kind === "Identifier") {
                        add(declaration.id, declaration.init);
                        if (
                            (node as A.Var).declarationKind === "const" &&
                            declaration.init &&
                            getterObject(declaration.init) &&
                            !getterNames.has(declaration.id.name)
                        ) {
                            getterNames.add(declaration.id.name);
                            changed = true;
                        }
                    }
            } else if (node.kind === "Assignment") {
                const assignment = node as A.Assignment;
                if (
                    assignment.operator === "=" &&
                    assignment.left.kind === "Identifier"
                )
                    add(assignment.left, assignment.right);
            }
        });
    }
    const ioNames = new Set([
        "stdin",
        "stdout",
        "stderr",
        "openStdin",
        "emitWarning",
    ]);
    const selectIO = (object: A.Expression, key: string | undefined) => {
        if (processObject(object) && key !== undefined && ioNames.has(key))
            requireRuntimePrelude("stream");
    };
    const request = (arguments_: A.Argument[]) => {
        lookup = true;
        const first = arguments_[0];
        if (!first) return;
        const literal =
            first.kind === "SpreadElement" ? undefined : text(first);
        if (literal !== undefined) literals.add(literal);
        else if (first.kind !== "Literal") computed = true;
    };
    walk(ast.body, (node, parent) => {
        // The global crypto is node:crypto's webcrypto (module-records.js).
        if (
            (node.kind === "Identifier" &&
                (node as A.Identifier).name === "crypto") ||
            (node.kind === "Member" &&
                globalObject((node as A.Member).object) &&
                text((node as A.Member).property) === "crypto")
        )
            literals.add("node:crypto");
        // Global fetch is a lazy provider over the native HTTP/TLS modules.
        if (
            (node.kind === "Identifier" &&
                (node as A.Identifier).name === "fetch" &&
                fetchReference(node)) ||
            (node.kind === "Member" &&
                globalObject((node as A.Member).object) &&
                text((node as A.Member).property) === "fetch")
        )
            literals.add("nona:internal/fetch");
        if (
            ["Identifier", "Member", "Call"].includes(node.kind) &&
            processObject(node as A.Expression)
        )
            requireRuntimePrelude("process");
        if (
            ["Identifier", "Member", "Call"].includes(node.kind) &&
            (processObject(node as A.Expression) ||
                globalObject(node as A.Expression))
        ) {
            // Simple local aliases are tracked; other object escapes may invoke the API
            // through unknown parameters, returned objects or aggregate contents.
            const receiver =
                (parent?.kind === "Member" &&
                    (parent as A.Member).object === node) ||
                (parent?.kind === "OptionalChain" &&
                    (parent as A.OptionalChain).base === node);
            const local =
                (parent?.kind === "Var" &&
                    (parent as A.Var).declarations.some(
                        (d) =>
                            d.id === node ||
                            (d.id.kind === "Identifier" && d.init === node),
                    )) ||
                (parent?.kind === "Assignment" &&
                    (parent as A.Assignment).left.kind === "Identifier");
            const declaration =
                parent?.kind === "Import" ||
                parent?.kind === "Function" ||
                parent?.kind === "FunctionExpression";
            const scalar =
                parent?.kind === "ExpressionStatement" ||
                parent?.kind === "Unary" ||
                (parent?.kind === "Binary" &&
                    !["&&", "||", "??", ","].includes(
                        (parent as A.Binary).operator,
                    ));
            const call =
                    parent?.kind === "Call" ? (parent as A.Call) : undefined,
                callee = call?.callee;
            const reflected =
                globalObject(node as A.Expression) &&
                call?.arguments[0] === node &&
                callee?.kind === "Member" &&
                callee.object.kind === "Identifier" &&
                ["Reflect", "Object"].includes(callee.object.name) &&
                ["get", "getOwnPropertyDescriptor"].includes(
                    text(callee.property) ?? "",
                );
            if (!receiver && !local && !declaration && !scalar && !reflected)
                computed = true;
        }
        if (node.kind === "Member") {
            const member = node as A.Member,
                key = text(member.property);
            selectIO(member.object, key);
            if (key === "getBuiltinModule") {
                lookup = true;
                if (
                    parent?.kind === "Call" &&
                    (parent as A.Call).callee === member
                )
                    request((parent as A.Call).arguments);
                else if (!getterDeclaration(parent, node)) computed = true;
            } else if (
                key === undefined &&
                (processObject(member.object) || globalObject(member.object))
            ) {
                // A scalar global read or constructor call cannot use the process object.
                // Keep inventory selection for escaping values and nested API lookups.
                const scalarGlobal =
                    globalObject(member.object) &&
                    (parent?.kind === "Unary" ||
                        (parent?.kind === "New" &&
                            (parent as A.New).callee === member));
                if (!scalarGlobal) computed = true;
            }
        } else if (
            node.kind === "Identifier" &&
            getterNames.has((node as A.Identifier).name) &&
            parent?.kind !== "Import"
        ) {
            lookup = true;
            if (parent?.kind === "Call" && (parent as A.Call).callee === node)
                request((parent as A.Call).arguments);
            else if (!getterDeclaration(parent, node)) computed = true;
        } else if (node.kind === "ObjectPattern") {
            if (
                (node as A.ObjectPattern).properties.some(
                    (property) => text(property.key) === "getBuiltinModule",
                )
            )
                computed = lookup = true;
        } else if (node.kind === "Call") {
            const call = node as A.Call,
                object = call.arguments[0];
            if (
                call.callee.kind === "Member" &&
                ["get", "getOwnPropertyDescriptor"].includes(
                    text(call.callee.property) ?? "",
                ) &&
                object?.kind !== "SpreadElement" &&
                object
            ) {
                const key = call.arguments[1],
                    unknown =
                        !key ||
                        key.kind === "SpreadElement" ||
                        text(key) === undefined;
                selectIO(
                    object,
                    unknown ? undefined : text(key as A.Expression),
                );
                if (
                    globalObject(object) &&
                    !unknown &&
                    text(key as A.Expression) === "fetch"
                )
                    literals.add("nona:internal/fetch");
                if (
                    processObject(object) &&
                    (unknown ||
                        text(key as A.Expression) === "getBuiltinModule")
                )
                    computed = true;
                if (
                    globalObject(object) &&
                    (unknown ||
                        (text(call.callee.property) ===
                            "getOwnPropertyDescriptor" &&
                            text(key as A.Expression) === "process" &&
                            !observedDescriptors.has(call)))
                )
                    computed = true;
            }
        } else if (node.kind === "OptionalChain") {
            const chain = node as A.OptionalChain;
            for (let i = 0; i < chain.links.length; i++) {
                const link = chain.links[i]!;
                if (i === 0 && link.kind === "property")
                    selectIO(chain.base, text(link.property));
                if (
                    i === 0 &&
                    link.kind === "property" &&
                    globalObject(chain.base) &&
                    text(link.property) === "fetch"
                )
                    literals.add("nona:internal/fetch");
                if (
                    link.kind === "property" &&
                    text(link.property) === "getBuiltinModule"
                ) {
                    lookup = true;
                    const next = chain.links[i + 1];
                    if (next?.kind === "call") request(next.arguments);
                    else computed = true;
                } else if (
                    link.kind === "property" &&
                    text(link.property) === undefined &&
                    (processObject(chain.base) || globalObject(chain.base))
                )
                    computed = true;
            }
        }
    });
    if (lookup || computed) requireRuntimePrelude("process");
    const candidates = host.builtinCandidates?.() ?? [];
    if (computed) return candidates;
    return candidates.filter((path) =>
        (host.builtinAliases?.(path) ?? []).some((alias) =>
            literals.has(alias),
        ),
    );
}

/**
 * Module early errors on top-level names (ECMA-262 16.2.1.1): function and
 * class declarations are lexical in module code, so they may not repeat or
 * collide with var-declared names.
 */
function checkModuleNames(ast: A.Program, path: string): void {
    const lexical = new Map<string, A.Node>(),
        vars = new Map<string, A.Node>();
    const addLexical = (id: A.Identifier) => {
        if (lexical.has(id.name) || vars.has(id.name))
            fail(`Duplicate declaration '${id.name}' in module`, path, id);
        lexical.set(id.name, id);
    };
    const collectVars = (statement: A.Statement | null | undefined): void => {
        if (!statement) return;
        switch (statement.kind) {
            case "Var":
                if (statement.declarationKind === "var")
                    for (const d of statement.declarations)
                        for (const id of boundNames(d.id))
                            vars.set(id.name, id);
                break;
            case "Block":
                statement.body.forEach(collectVars);
                break;
            case "If":
                collectVars(statement.consequent);
                collectVars(statement.alternate);
                break;
            case "While":
            case "DoWhile":
            case "Labeled":
                collectVars(statement.body);
                break;
            case "For":
                if (statement.init?.kind === "Var") collectVars(statement.init);
                collectVars(statement.body);
                break;
            case "ForIn":
            case "ForOf":
                if (statement.left.kind === "Var") collectVars(statement.left);
                collectVars(statement.body);
                break;
            case "Switch":
                for (const c of statement.cases) c.body.forEach(collectVars);
                break;
            case "Try":
                collectVars(statement.body);
                collectVars(statement.handler);
                collectVars(statement.finalizer);
                break;
            case "Export":
                if (statement.declaration) collectVars(statement.declaration);
                break;
        }
    };
    ast.body.forEach(collectVars);
    const exported = new Set<string>();
    const addExport = (name: string, node: A.Node) => {
        if (exported.has(name)) fail(`Duplicate export '${name}'`, path, node);
        exported.add(name);
    };
    for (const statement of ast.body)
        if (statement.kind === "Export") {
            if (statement.isDefault || statement.defaultExpression)
                addExport("default", statement);
            else if (statement.declaration?.kind === "Var")
                for (const d of statement.declaration.declarations)
                    for (const id of boundNames(d.id)) addExport(id.name, id);
            else if (statement.declaration)
                addExport(statement.declaration.id.name, statement.declaration);
            for (const specifier of statement.specifiers ?? [])
                addExport(specifier.exported, statement);
            if (statement.namespace !== undefined)
                addExport(statement.namespace, statement);
        }
    for (const statement of ast.body) {
        const declaration =
            statement.kind === "Export" ? statement.declaration : statement;
        if (!declaration) continue;
        if (declaration.kind === "Function" || declaration.kind === "Class")
            addLexical(declaration.id);
        else if (
            declaration.kind === "Var" &&
            declaration.declarationKind !== "var"
        )
            for (const d of declaration.declarations)
                for (const id of boundNames(d.id)) addLexical(id);
        else if (declaration.kind === "Import")
            for (const specifier of declaration.specifiers)
                addLexical(specifier.local);
    }
}

export function moduleRequests(ast: Pick<A.Program, "body">): {
    static: string[];
    dynamic: string[];
    computed: boolean;
} {
    const statics: string[] = [],
        dynamics: string[] = [];
    let computed = false;
    for (const statement of ast.body) {
        if (statement.kind === "Import") statics.push(statement.source);
        if (statement.kind === "Export" && statement.source !== undefined)
            statics.push(statement.source);
    }
    walk(ast.body, (node) => {
        if (node.kind !== "ImportCall") return;
        const argument = (node as A.ImportCall).argument;
        if (argument.kind === "Literal" && typeof argument.value === "string")
            dynamics.push(argument.value);
        else if (
            argument.kind === "Template" &&
            argument.expressions.length === 0
        )
            dynamics.push(argument.quasis[0]!);
        else if (!(
            argument.kind === "Literal" && typeof argument.value === "string"
        ))
            computed = true;
    });
    return { static: statics, dynamic: dynamics, computed };
}

/**
 * Load the module graph reachable from the entry through static imports and
 * string-literal dynamic imports and planned builtin lookups. A missing static dependency is a compile error;
 * a missing dynamic one rejects at run time.
 */
export function loadModuleGraph(
    entryPath: string,
    entrySource: string | null,
    host: ModuleHost,
    scriptRequests: string[] = [],
    options: { deferBuiltinUsage?: boolean } = {},
): ModuleRecord[] {
    const records: ModuleRecord[] = [],
        byPath = new Map<string, ModuleRecord>();
    const load = (
        path: string,
        source: string,
        dynamic = false,
    ): ModuleRecord => {
        let ast: A.Program, loadError: string | undefined;
        const builtinAliases = host.builtinAliases?.(path);
        let deferredUsage: ModuleRecord["deferredUsage"];
        try {
            const read = () =>
                host.program?.(path) ??
                lowerLiteralEval(
                    lowerDynamicFunctions(
                        parse(lex(source, { module: true }), { module: true }),
                    ),
                );
            if (builtinAliases && options.deferBuiltinUsage) {
                const collected = collectSourceUsage(read, { detached: true });
                ast = collected.result;
                deferredUsage = collected;
            } else ast = read();
            checkModuleNames(ast, path);
        } catch (error) {
            if (!(error instanceof CompileError)) throw error;
            // A module first reached through import() fails when that import runs.
            if (!dynamic)
                throw new CompileError(
                    error.diagnostics.map((d) => ({
                        ...d,
                        file: d.file || path,
                    })),
                );
            ast = {
                kind: "Program",
                body: [],
                module: true,
                source: "",
                span: { start: 0, end: 0 },
            };
            loadError = error.diagnostics[0]?.message ?? "Invalid module";
        }
        const record: ModuleRecord = {
            index: records.length,
            path,
            ast,
            requests: new Map(),
            staticRequests: [],
            dynamicRequests: [],
            ...(builtinAliases ? { builtinAliases } : {}),
            ...(deferredUsage ? { deferredUsage } : {}),
            ...(loadError === undefined ? {} : { loadError }),
        };
        records.push(record);
        byPath.set(path, record);
        const requests = moduleRequests(ast);
        const dynamics = [
            ...requests.dynamic,
            ...(requests.computed ? (host.candidates?.(path) ?? []) : []),
            ...(builtinAliases ? [] : builtinModuleRequests(ast, host)),
        ].filter((s, i, all) => all.indexOf(s) === i);
        for (const [specifier, isStatic] of [
            ...requests.static.map((s) => [s, true] as const),
            ...dynamics.map((s) => [s, false] as const),
        ]) {
            const resolved = host.resolve(specifier, path);
            if (resolved === undefined) {
                if (isStatic)
                    fail(`Cannot resolve module '${specifier}'`, path);
                continue;
            }
            let target = byPath.get(resolved);
            if (!target) {
                const text = host.read(resolved);
                if (text === undefined) {
                    if (isStatic)
                        fail(
                            `Cannot read module '${specifier}' (${resolved})`,
                            path,
                        );
                    continue;
                }
                target = load(resolved, text, !isStatic);
            }
            record.requests.set(specifier, target.index);
            if (isStatic && !record.staticRequests.includes(target.index))
                record.staticRequests.push(target.index);
            if (!isStatic && !record.dynamicRequests.includes(target.index))
                record.dynamicRequests.push(target.index);
        }
        return record;
    };
    if (entrySource !== null) load(entryPath, entrySource);
    // Supplemental targets for a classic script or module harness stay lazy.
    for (const specifier of scriptRequests) {
        const resolved = host.resolve(specifier, entryPath);
        if (resolved === undefined || byPath.has(resolved)) continue;
        const text = host.read(resolved);
        if (text !== undefined) load(resolved, text, true);
    }
    return records;
}
