import type * as A from "./ast.js";
import type { ModuleRecord } from "./modules.js";
import { boundNames } from "./declarations.js";
import { mergeSourceUsage, recordSourceUsage } from "./lexer.js";

/**
 * Reachability pruning of built-in modules (#440).
 *
 * A named import of a built-in module keeps only the top-level declarations
 * of that module it can reach. Each built-in record is split into units (an
 * import specifier, a declarator, a function or class declaration, an export
 * specifier, a property of a private object literal, a statement that only
 * initializes a property of one declaration) with an edge to every top-level
 * name a unit mentions, nested functions included. The roots are the demanded
 * exports and every statement that may have an effect when the module is
 * evaluated. Demand starts from the static named imports and re-exports of
 * the modules that are kept whole (user modules and built-ins that cannot be
 * analysed) and grows to a fixpoint over the graph: a kept unit that imports
 * a name of another built-in demands it.
 *
 * A module is kept whole when anything can observe it as an object: a
 * namespace import, `export *`, an import of a default export that aggregates
 * the module, import(), a builtin lookup (process.getBuiltinModule, require,
 * computed specifiers) or a script request. A pruned module's namespace is
 * therefore never observable, and every kept declaration is the one binding
 * all importers share. The purity analysis is conservative: literals,
 * functions, classes without static code, object and array literals of pure
 * parts, reads of initialized bindings and standard globals, nona:ffi
 * define() and calls of local functions that only build and return a new
 * function or object. The analysis assumes that standard globals named by the
 * allow lists below have not been replaced with accessors before a built-in
 * module evaluates.
 *
 * Pruning runs before lowering and before the runtime parts are chosen: the
 * lexical usage of a pruned built-in is that of its kept units only.
 */

/** Per built-in module: what pruning kept and removed (tests and evidence). */
export interface BuiltinPruning {
    path: string;
    /** Every top-level declaration is kept: the module is fully demanded or cannot be analysed. */
    full: boolean;
    /** The exports that remain. */
    exports: string[];
    /** Kept and removed units: declared names, `object.property` for private object members, `name.property=` for property initializers, `<effect@offset>` for other statements. */
    kept: string[];
    removed: string[];
    /** Units kept because evaluating them may have an effect. */
    roots: string[];
}

let pruningReport: BuiltinPruning[] | undefined;
/** Runs `run` and returns the pruning of every module graph it compiles. */
export function collectBuiltinPruning<T>(run: () => T): {
    result: T;
    pruning: BuiltinPruning[];
} {
    const outer = pruningReport,
        pruning: BuiltinPruning[] = [];
    pruningReport = pruning;
    try {
        return { result: run(), pruning };
    } finally {
        pruningReport = outer;
    }
}

const typedArrays = [
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
];
/** Standard globals whose read (and whose data properties' reads) is taken to be free of effects. */
const pureGlobals = new Set([
    "undefined",
    "NaN",
    "Infinity",
    "Object",
    "Function",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Symbol",
    "BigInt",
    "Math",
    "JSON",
    "Reflect",
    "Date",
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "ReferenceError",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Promise",
    "ArrayBuffer",
    "DataView",
    "TextEncoder",
    "TextDecoder",
    ...typedArrays,
]);
/** Constructors that cannot fail or run user code without arguments (or with one small length). */
const pureConstructors = new Set([
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "TextEncoder",
    "TextDecoder",
]);
const lengthConstructors = new Set(["ArrayBuffer", ...typedArrays]);
/** Function own properties an assignment cannot create (strict mode throws or the meaning changes). */
const reservedProperties = new Set([
    "name",
    "length",
    "prototype",
    "caller",
    "arguments",
    "__proto__",
    "constructor",
]);

type Declaration =
    | { kind: "function"; node: A.FunctionDeclaration }
    | { kind: "class" | "var" | "let"; at: [number, number] }
    | { kind: "const"; at: [number, number]; init: A.Expression | null }
    | { kind: "import"; source: string; imported?: string };

interface Unit {
    label: string;
    /** Source range whose lexical usage the unit contributes (or literal text). */
    usage: { start: number; end: number } | string;
    root: boolean;
    refs: Set<string>;
    /** Members of tracked private objects: [object, property]. */
    props: [string, string][];
    /** Exports of other modules this unit demands: [record index, name or "*"]. */
    imports: [number, string][];
}

interface Analysis {
    record: ModuleRecord;
    units: Unit[];
    bindings: Map<string, number[]>;
    propUnits: Map<string, Map<string, number>>;
    exports: Map<string, { binding: string } | { unit: number }>;
    /** The default export is an expression that may aggregate the module (an object literal of its exports). */
    defaultAggregate: boolean;
    emit: ((kept: Set<number>) => A.Statement[])[];
    kept: Set<number>;
    full: boolean;
}

function stringKey(key: A.Expression): string | undefined {
    if (key.kind === "Literal" && typeof key.value === "string")
        return key.value;
    if (key.kind === "Identifier") return key.name;
    return undefined;
}
function literalString(node: A.Expression): string | undefined {
    return node.kind === "Literal" && typeof node.value === "string"
        ? node.value
        : undefined;
}

type Visit = (id: A.Identifier, parent: unknown, grand: unknown) => void;
/**
 * Names a function body declares for the whole body: var declarations
 * anywhere, and the declarations of the body's own statement list. Block
 * declarations deeper down are not included (they over-approximate as references).
 */
function bodyNames(body: A.Block): Set<string> {
    const names = new Set<string>();
    const vars = (statement: A.Statement | null | undefined): void => {
        if (!statement) return;
        switch (statement.kind) {
            case "Var":
                if (statement.declarationKind === "var")
                    for (const d of statement.declarations)
                        for (const id of boundNames(d.id)) names.add(id.name);
                break;
            case "Block":
                statement.body.forEach(vars);
                break;
            case "If":
                vars(statement.consequent);
                vars(statement.alternate);
                break;
            case "While":
            case "DoWhile":
            case "Labeled":
                vars(statement.body);
                break;
            case "For":
                if (statement.init?.kind === "Var") vars(statement.init);
                vars(statement.body);
                break;
            case "ForIn":
            case "ForOf":
                if (statement.left.kind === "Var") vars(statement.left);
                vars(statement.body);
                break;
            case "Switch":
                for (const c of statement.cases) c.body.forEach(vars);
                break;
            case "Try":
                vars(statement.body);
                vars(statement.handler);
                vars(statement.finalizer);
                break;
        }
    };
    for (const statement of body.body) {
        vars(statement);
        if (statement.kind === "Function" || statement.kind === "Class")
            names.add(statement.id.name);
        else if (statement.kind === "Var")
            for (const d of statement.declarations)
                for (const id of boundNames(d.id)) names.add(id.name);
    }
    return names;
}
const skippedKeys = new Set(["span", "source", "sourceSpan", "sourceText"]);
/** Calls `visit` for every identifier in a reference position (reads and writes; not declared names, labels or property keys). */
function references(root: unknown, visit: Visit): void {
    const stack: unknown[] = [],
        scopes: Set<string>[] = [];
    const shadowed = (name: string) => scopes.some((scope) => scope.has(name));
    const node = (value: unknown): void => {
        if (Array.isArray(value)) {
            for (const item of value) node(item);
            return;
        }
        if (!value || typeof value !== "object") return;
        const n = value as Record<string, unknown> & { kind?: string };
        const parent = stack[stack.length - 1],
            grand = stack[stack.length - 2];
        stack.push(value);
        try {
            switch (n.kind) {
                case "Identifier":
                    if (!shadowed((value as A.Identifier).name))
                        visit(value as A.Identifier, parent, grand);
                    return;
                case "Function":
                case "FunctionExpression": {
                    const f = value as unknown as A.FunctionNode;
                    const parameters = new Set(
                        [...f.parameters, ...(f.rest ? [f.rest] : [])].flatMap(
                            (p) => boundNames(p).map((id) => id.name),
                        ),
                    );
                    // A named function expression sees its own name.
                    if (n.kind === "FunctionExpression" && f.id)
                        parameters.add(f.id.name);
                    scopes.push(parameters);
                    try {
                        for (const p of f.parameters) pattern(p, true);
                        node(f.defaults);
                        if (f.rest) pattern(f.rest, true);
                        node((f as A.FunctionExpression).instanceFields);
                        scopes.push(bodyNames(f.body));
                        try {
                            node(f.body);
                        } finally {
                            scopes.pop();
                        }
                    } finally {
                        scopes.pop();
                    }
                    return;
                }
                case "Class":
                case "ClassExpression": {
                    const c = value as unknown as A.ClassDeclaration;
                    node(c.superClass);
                    for (const m of c.methods) {
                        if (m.computed) node(m.key);
                        node(m.value);
                        node(m.keyBinding);
                    }
                    node(c.constructorMethod);
                    node(c.instanceInitializer);
                    node(c.instanceFields);
                    return;
                }
                case "ObjectLiteral":
                    for (const p of (value as unknown as A.ObjectLiteral)
                        .properties) {
                        if ("spread" in p) node(p.spread);
                        else {
                            if (p.computed) node(p.key);
                            node(p.value);
                        }
                    }
                    return;
                case "Var":
                    for (const d of (value as unknown as A.Var).declarations) {
                        pattern(d.id, true);
                        node(d.init);
                    }
                    return;
                case "Try": {
                    const t = value as unknown as A.Try;
                    node(t.body);
                    if (t.parameter) pattern(t.parameter, true);
                    node(t.handler);
                    node(t.finalizer);
                    return;
                }
                case "Assignment": {
                    const a = value as unknown as A.Assignment;
                    pattern(a.left, false);
                    node(a.right);
                    return;
                }
                case "Labeled":
                    node((value as unknown as A.Labeled).body);
                    return;
                case "Break":
                case "Continue":
                case "PrivateName":
                    return;
            }
            for (const [key, child] of Object.entries(n))
                if (!skippedKeys.has(key)) node(child);
        } finally {
            stack.pop();
        }
    };
    const pattern = (p: A.BindingPattern, declaring: boolean): void => {
        if (p.kind === "Identifier") {
            if (!declaring) node(p);
            return;
        }
        if (p.kind === "Member") {
            node(p);
            return;
        }
        stack.push(p);
        try {
            if (p.kind === "ArrayPattern")
                for (const element of p.elements) {
                    if (!element) continue;
                    stack.push(element);
                    pattern(element.id, declaring);
                    stack.pop();
                    node(element.init);
                }
            else
                for (const property of p.properties) {
                    if (property.computed) node(property.key);
                    stack.push(property.value);
                    pattern(property.value.id, declaring);
                    stack.pop();
                    node(property.value.init);
                }
            if (p.rest) pattern(p.rest, declaring);
        } finally {
            stack.pop();
        }
    };
    node(root);
}

function topLevelNames(body: A.Statement[]): Set<string> {
    const names = new Set<string>();
    for (const statement of body) {
        if (statement.kind === "Import")
            for (const s of statement.specifiers) names.add(s.local.name);
        if (statement.kind === "Export" && statement.defaultId)
            names.add(statement.defaultId.name);
        const declaration =
            statement.kind === "Export" ? statement.declaration : statement;
        if (declaration?.kind === "Function" || declaration?.kind === "Class")
            names.add(declaration.id.name);
        else if (declaration?.kind === "Var")
            for (const d of declaration.declarations)
                for (const id of boundNames(d.id)) names.add(id.name);
    }
    return names;
}
/**
 * Top-level names of `original` that `pruned` still mentions but no longer
 * declares: code that pruning removed although kept code reaches it (tests).
 */
export function danglingReferences(
    original: A.Program,
    pruned: A.Program,
): string[] {
    const before = topLevelNames(original.body),
        after = topLevelNames(pruned.body),
        dangling = new Set<string>();
    references(pruned.body, (id) => {
        if (before.has(id.name) && !after.has(id.name)) dangling.add(id.name);
    });
    for (const statement of pruned.body)
        if (statement.kind === "Export" && statement.source === undefined)
            for (const s of statement.specifiers ?? [])
                if (!after.has(s.local)) dangling.add(s.local);
    return [...dangling];
}

function contains(root: unknown, test: (node: A.Node) => boolean): boolean {
    const pending: unknown[] = [root];
    while (pending.length) {
        const value = pending.pop();
        if (Array.isArray(value)) {
            pending.push(...value);
            continue;
        }
        if (!value || typeof value !== "object") continue;
        const record = value as Record<string, unknown>;
        if (
            typeof record.kind === "string" &&
            test(record as unknown as A.Node)
        )
            return true;
        for (const [key, child] of Object.entries(record))
            if (!skippedKeys.has(key)) pending.push(child);
    }
    return false;
}

/** Whether a module cannot be split into units safely. */
function unprunable(ast: A.Program): boolean {
    if (ast.topLevelAwait) return true;
    if (ast.body.some((s) => s.kind === "Export" && s.star)) return true;
    return contains(
        ast.body,
        (node) =>
            node.kind === "With" ||
            (node.kind === "Identifier" &&
                (node as A.Identifier).name === "eval") ||
            (node.kind === "FunctionExpression" &&
                !!(
                    (node as A.FunctionExpression).dynamic ||
                    (node as A.FunctionExpression).realmLocal ||
                    (node as A.FunctionExpression).evalVarNames
                )) ||
            (node.kind === "Function" &&
                !!(node as A.FunctionDeclaration).evalVarNames),
    );
}

function analyze(
    record: ModuleRecord,
    mutated: ReadonlySet<string>,
): Analysis | null {
    const ast = record.ast;
    if (record.loadError !== undefined || unprunable(ast)) return null;
    const body = ast.body;
    // Top-level declarations and where lexical ones are initialized.
    const declarations = new Map<string, Declaration>();
    body.forEach((statement, index) => {
        const declaration =
            statement.kind === "Export" ? statement.declaration : statement;
        if (statement.kind === "Import")
            for (const s of statement.specifiers)
                declarations.set(s.local.name, {
                    kind: "import",
                    source: statement.source,
                    ...(s.kind === "named" ? { imported: s.imported } : {}),
                });
        if (!declaration) {
            if (statement.kind === "Export" && statement.defaultId)
                declarations.set(statement.defaultId.name, {
                    kind: "const",
                    at: [index, 0],
                    init: null,
                });
            return;
        }
        if (declaration.kind === "Function")
            declarations.set(declaration.id.name, {
                kind: "function",
                node: declaration,
            });
        else if (declaration.kind === "Class")
            declarations.set(declaration.id.name, {
                kind: "class",
                at: [index, 0],
            });
        else if (declaration.kind === "Var")
            declaration.declarations.forEach((d, ordinal) => {
                for (const id of boundNames(d.id))
                    declarations.set(
                        id.name,
                        declaration.declarationKind === "const"
                            ? {
                                  kind: "const",
                                  at: [index, ordinal],
                                  init:
                                      d.id.kind === "Identifier"
                                          ? d.init
                                          : null,
                              }
                            : {
                                  kind: declaration.declarationKind,
                                  at: [index, ordinal],
                              },
                    );
            });
    });
    // Top-level names some code assigns to (a reassigned function is no factory).
    const written = new Set<string>();
    references(body, (id, parent) => {
        const p = parent as Record<string, unknown> | undefined;
        if (
            p &&
            ((p.kind === "Assignment" && p.left === id) ||
                (p.kind === "Update" && p.argument === id) ||
                ((p.kind === "ForIn" || p.kind === "ForOf") && p.left === id) ||
                p.id === id ||
                p.rest === id)
        )
            written.add(id.name);
    });
    const exportedLocals = new Set<string>();
    for (const statement of body)
        if (statement.kind === "Export" && statement.source === undefined) {
            for (const s of statement.specifiers ?? [])
                exportedLocals.add(s.local);
            if (statement.declaration?.kind === "Var")
                for (const d of statement.declaration.declarations)
                    for (const id of boundNames(d.id))
                        exportedLocals.add(id.name);
        }

    interface Context {
        at: [number, number];
        /** Parameters and locals of a factory body being proven pure. */
        locals?: Set<string>;
    }
    const initialized = (name: string, context: Context): boolean => {
        if (context.locals?.has(name)) return true;
        const d = declarations.get(name);
        if (!d) return pureGlobals.has(name);
        if (d.kind === "function" || d.kind === "var") return true;
        if (d.kind === "import" || context.locals) return false;
        const [index, ordinal] = d.at;
        return (
            index < context.at[0] ||
            (index === context.at[0] && ordinal < context.at[1])
        );
    };
    const ffiDefine = (callee: A.Expression): boolean => {
        if (callee.kind !== "Identifier") return false;
        const d = declarations.get(callee.name);
        return (
            d?.kind === "import" &&
            d.source === "nona:ffi" &&
            d.imported === "define"
        );
    };
    // Functions whose call only builds and returns a new value.
    const factories = new Map<string, "function" | "object" | "other" | null>();
    const factory = (name: string): "function" | "object" | "other" | null => {
        if (factories.has(name)) return factories.get(name)!;
        const d = declarations.get(name);
        if (d?.kind !== "function" || written.has(name)) return null;
        const f = d.node;
        factories.set(name, null);
        if (
            f.async ||
            f.generator ||
            f.rest ||
            f.defaults?.some((value) => value !== null) ||
            f.parameters.some((p) => p.kind !== "Identifier")
        )
            return null;
        const locals = new Set(
            f.parameters.map((p) => (p as A.Identifier).name),
        );
        for (const s of f.body.body)
            if (s.kind === "Function") locals.add(s.id.name);
        let kind: "function" | "object" | "other" = "other";
        const statements = f.body.body;
        for (let i = 0; i < statements.length; i++) {
            const s = statements[i]!;
            if (s.kind === "Function") continue;
            if (s.kind === "Var" && s.declarationKind !== "var") {
                for (const d of s.declarations) {
                    if (d.id.kind !== "Identifier") return null;
                    if (d.init && !pure(d.init, { at: [0, 0], locals }))
                        return null;
                    locals.add(d.id.name);
                }
                continue;
            }
            if (s.kind === "Return" && i === statements.length - 1) {
                if (s.argument) {
                    if (!pure(s.argument, { at: [0, 0], locals })) return null;
                    kind =
                        s.argument.kind === "FunctionExpression"
                            ? "function"
                            : plainLiteral(s.argument)
                              ? "object"
                              : "other";
                }
                continue;
            }
            return null;
        }
        factories.set(name, kind);
        return kind;
    };
    const plainLiteral = (e: A.Expression): boolean =>
        e.kind === "ObjectLiteral" &&
        e.properties.every(
            (p) =>
                !("spread" in p) &&
                !p.accessor &&
                !p.prototype &&
                (!p.computed || p.key.kind === "Literal"),
        );
    // Constants holding an object whose data properties may be read without effects.
    const plain = (name: string, seen = new Set<string>()): boolean => {
        if (seen.has(name) || mutated.has(name)) return false;
        seen.add(name);
        const d = declarations.get(name);
        if (d?.kind !== "const" || !d.init) return false;
        const value = (e: A.Expression): boolean =>
            plainLiteral(e) ||
            (e.kind === "Call" &&
                e.callee.kind === "Identifier" &&
                factory(e.callee.name) === "object") ||
            (e.kind === "Conditional" &&
                value(e.consequent) &&
                value(e.alternate)) ||
            (e.kind === "Identifier" && plain(e.name, seen));
        return value(d.init);
    };
    // BigInt operands are excluded: `1n + 1` and `+1n` throw.
    const primitive = (e: A.Expression): boolean =>
        (e.kind === "Literal" && typeof e.value !== "bigint") ||
        (e.kind === "Template" && !e.expressions.length) ||
        (e.kind === "Unary" &&
            ["-", "+", "~", "!", "typeof", "void"].includes(e.operator) &&
            primitive(e.argument)) ||
        (e.kind === "Binary" &&
            !["in", "instanceof"].includes(e.operator) &&
            primitive(e.left) &&
            primitive(e.right));
    const arguments_ = (list: A.Argument[], context: Context): boolean =>
        list.every((a) => a.kind !== "SpreadElement" && pure(a, context));
    const classPure = (c: A.ClassDeclaration | A.ClassExpression): boolean =>
        c.superClass === null &&
        c.methods.every(
            (m) =>
                (!m.computed || m.key.kind === "Literal") &&
                m.element !== "staticBlock" &&
                !(m.element === "field" && m.isStatic),
        );
    const pure = (e: A.Expression, context: Context): boolean => {
        switch (e.kind) {
            case "Literal":
            case "RegExpLiteral":
            case "FunctionExpression":
                return true;
            case "Template":
                return !e.expressions.length;
            case "ClassExpression":
                return classPure(e);
            case "Identifier":
                return initialized(e.name, context);
            case "ObjectLiteral":
                return e.properties.every(
                    (p) =>
                        !("spread" in p) &&
                        !p.prototype &&
                        (!p.computed || p.key.kind === "Literal") &&
                        pure(p.value, context),
                );
            case "ArrayLiteral":
                return e.elements.every(
                    (element) =>
                        element === null ||
                        (element.kind !== "SpreadElement" &&
                            pure(element, context)),
                );
            case "Unary":
                return e.operator === "typeof" ||
                    e.operator === "void" ||
                    e.operator === "!"
                    ? pure(e.argument, context)
                    : primitive(e);
            case "Binary":
                if (["===", "!==", "&&", "||", "??"].includes(e.operator))
                    return pure(e.left, context) && pure(e.right, context);
                return primitive(e);
            case "Conditional":
                return (
                    pure(e.test, context) &&
                    pure(e.consequent, context) &&
                    pure(e.alternate, context)
                );
            case "Member": {
                if (e.object.kind !== "Identifier") return false;
                const key = literalString(e.property);
                if (key === undefined) return false;
                const name = e.object.name;
                if (!declarations.has(name) && !context.locals?.has(name))
                    return (
                        pureGlobals.has(name) &&
                        !["undefined", "NaN", "Infinity"].includes(name) &&
                        // Function.prototype's poison-pill accessors throw.
                        !["caller", "arguments", "callee"].includes(key)
                    );
                return (
                    !context.locals?.has(name) &&
                    initialized(name, context) &&
                    plain(name)
                );
            }
            case "Call":
                // define() is a compile-time intrinsic of three string literals.
                if (ffiDefine(e.callee))
                    return (
                        e.arguments.length === 3 &&
                        e.arguments.every(
                            (a) =>
                                a.kind !== "SpreadElement" &&
                                literalString(a) !== undefined,
                        )
                    );
                return (
                    e.callee.kind === "Identifier" &&
                    !context.locals?.has(e.callee.name) &&
                    factory(e.callee.name) !== null &&
                    arguments_(e.arguments, context)
                );
            case "New": {
                if (
                    e.callee.kind !== "Identifier" ||
                    declarations.has(e.callee.name) ||
                    context.locals?.has(e.callee.name)
                )
                    return false;
                const name = e.callee.name;
                if (pureConstructors.has(name)) return !e.arguments.length;
                if (!lengthConstructors.has(name)) return false;
                const length = e.arguments[0];
                return (
                    e.arguments.length === 0 ||
                    (e.arguments.length === 1 &&
                        length!.kind === "Literal" &&
                        typeof length!.value === "number" &&
                        Number.isInteger(length!.value) &&
                        length!.value >= 0 &&
                        length!.value <= 0x7fffffff)
                );
            }
        }
        return false;
    };

    // Private object literals read only as `object.name`: their members are units.
    // A read must name an own member (`o.valueOf()` returns the object), and a
    // call of a member passes the object as `this`, so the member must be a
    // function of the literal (which does not mention `this`).
    const tracked = new Set<string>();
    {
        const candidates = new Map<string, Map<string, A.Expression>>();
        for (const [name, d] of declarations)
            if (
                d.kind === "const" &&
                d.init?.kind === "ObjectLiteral" &&
                !exportedLocals.has(name) &&
                plainLiteral(d.init) &&
                !contains(
                    d.init,
                    (node) => node.kind === "This" || node.kind === "Super",
                )
            ) {
                const keys = d.init.properties.map((p) =>
                    "spread" in p ? undefined : stringKey(p.key),
                );
                if (
                    keys.every((k) => k !== undefined) &&
                    new Set(keys).size === keys.length &&
                    d.init.properties.every(
                        (p) => !("spread" in p) && pure(p.value, { at: d.at }),
                    )
                )
                    candidates.set(
                        name,
                        new Map(
                            d.init.properties.map((p, i) => [
                                keys[i]!,
                                (p as { value: A.Expression }).value,
                            ]),
                        ),
                    );
            }
        const escaped = new Set<string>();
        const member = (
            name: string,
            key: string | undefined,
            called: boolean,
        ): boolean => {
            const members = candidates.get(name)!;
            if (key === undefined || !members.has(key)) return false;
            return !called || members.get(key)!.kind === "FunctionExpression";
        };
        references(body, (id, parent, grand) => {
            if (!candidates.has(id.name)) return;
            const p = parent as A.Node | undefined,
                g = grand as Record<string, unknown> | undefined;
            if (
                p?.kind === "Member" &&
                (p as A.Member).object === id &&
                member(
                    id.name,
                    literalString((p as A.Member).property),
                    !!g &&
                        ((g.kind === "Call" && g.callee === p) ||
                            (g.kind === "TaggedTemplate" && g.tag === p)),
                ) &&
                !(
                    g &&
                    ((g.kind === "Assignment" && g.left === p) ||
                        (g.kind === "Update" && g.argument === p) ||
                        (g.kind === "Unary" &&
                            g.operator === "delete" &&
                            g.argument === p) ||
                        ((g.kind === "ForIn" || g.kind === "ForOf") &&
                            g.left === p) ||
                        g.id === p ||
                        g.rest === p)
                )
            )
                return;
            if (
                p?.kind === "OptionalChain" &&
                (p as A.OptionalChain).base === id &&
                (p as A.OptionalChain).links[0]?.kind === "property" &&
                member(
                    id.name,
                    literalString(
                        (
                            (p as A.OptionalChain).links[0] as {
                                property: A.Expression;
                            }
                        ).property,
                    ),
                    (p as A.OptionalChain).links[1]?.kind === "call",
                )
            )
                return;
            escaped.add(id.name);
        });
        for (const name of candidates.keys())
            if (!escaped.has(name)) tracked.add(name);
    }

    const units: Unit[] = [],
        bindings = new Map<string, number[]>(),
        propUnits = new Map<string, Map<string, number>>(),
        exports = new Map<string, { binding: string } | { unit: number }>(),
        emit: ((kept: Set<number>) => A.Statement[])[] = [];
    let defaultAggregate = false;
    const collect = (node: unknown) => {
        const refs = new Set<string>(),
            props: [string, string][] = [];
        references(node, (id, parent) => {
            if (tracked.has(id.name)) {
                const p = parent as A.Node;
                const key =
                    p.kind === "Member"
                        ? literalString((p as A.Member).property)
                        : literalString(
                              (
                                  (p as A.OptionalChain).links[0] as {
                                      property: A.Expression;
                                  }
                              ).property,
                          );
                props.push([id.name, key!]);
            } else if (declarations.has(id.name)) refs.add(id.name);
        });
        return { refs, props };
    };
    const add = (
        unit: Omit<Unit, "refs" | "props" | "imports"> &
            Partial<Pick<Unit, "imports">>,
        node: unknown,
        names: string[] = [],
    ): number => {
        const index = units.length;
        units.push({ imports: [], ...unit, ...collect(node) });
        for (const name of names) {
            const list = bindings.get(name) ?? [];
            list.push(index);
            bindings.set(name, list);
        }
        return index;
    };
    const target = (source: string): number => record.requests.get(source)!;
    const spanOf = (start: A.Node, end: A.Node | null | undefined) => ({
        start: start.span.start,
        end: (end ?? start).span.end,
    });
    // A statement `a.p = b.q = value;` that only initializes properties of fresh local values.
    const initializer = (
        statement: A.ExpressionStatement,
        context: Context,
    ): [string, string][] | undefined => {
        const targets: [string, string][] = [];
        let e: A.Expression = statement.expression;
        while (e.kind === "Assignment" && e.operator === "=") {
            const left = e.left;
            if (left.kind !== "Member" || left.object.kind !== "Identifier")
                return undefined;
            const key = literalString(left.property);
            const name = left.object.name,
                d = declarations.get(name);
            if (key === undefined || reservedProperties.has(key))
                return undefined;
            if (!initialized(name, context)) return undefined;
            const fresh =
                (d?.kind === "function" && !written.has(name)) ||
                (d?.kind === "const" &&
                    !!d.init &&
                    (d.init.kind === "FunctionExpression" ||
                        plainLiteral(d.init) ||
                        (d.init.kind === "Call" &&
                            d.init.callee.kind === "Identifier" &&
                            (factory(d.init.callee.name) === "function" ||
                                factory(d.init.callee.name) === "object"))));
            if (!fresh) return undefined;
            targets.push([name, key]);
            e = e.right;
        }
        return targets.length && pure(e, context) ? targets : undefined;
    };

    body.forEach((statement, index) => {
        const context: Context = { at: [index, 0] };
        const whole = { start: statement.span.start, end: statement.span.end };
        const root = () => {
            const names =
                statement.kind === "Export" && statement.declaration
                    ? statement.declaration.kind === "Var"
                        ? statement.declaration.declarations.flatMap((d) =>
                              boundNames(d.id).map((id) => id.name),
                          )
                        : [statement.declaration.id.name]
                    : statement.kind === "Var"
                      ? statement.declarations.flatMap((d) =>
                            boundNames(d.id).map((id) => id.name),
                        )
                      : statement.kind === "Function" ||
                          statement.kind === "Class"
                        ? [statement.id.name]
                        : [];
            const unit = add(
                {
                    label:
                        names.join(",") || `<effect@${statement.span.start}>`,
                    usage: whole,
                    root: true,
                },
                statement,
                names,
            );
            emit.push(() => [statement]);
            return unit;
        };
        if (statement.kind === "Import") {
            const from = target(statement.source);
            const specifiers = statement.specifiers.map((s) =>
                add(
                    {
                        label: s.local.name,
                        usage: [s.imported ?? "", s.local.name].join(" "),
                        root: false,
                        imports: [
                            [
                                from,
                                s.kind === "namespace"
                                    ? "*"
                                    : s.kind === "default"
                                      ? "default"
                                      : s.imported!,
                            ],
                        ],
                    },
                    null,
                    [s.local.name],
                ),
            );
            emit.push((kept) => [
                {
                    ...statement,
                    specifiers: statement.specifiers.filter((_, i) =>
                        kept.has(specifiers[i]!),
                    ),
                },
            ]);
            return;
        }
        if (statement.kind === "Export" && statement.source !== undefined) {
            const from = target(statement.source),
                list = statement.specifiers ?? [];
            const specifiers = list.map((s) => {
                const unit = add(
                    {
                        label: s.exported,
                        usage: `${s.local} ${s.exported}`,
                        root: false,
                        imports: [[from, s.local]],
                    },
                    null,
                );
                exports.set(s.exported, { unit });
                return unit;
            });
            emit.push((kept) => {
                const remaining = list.filter((_, i) =>
                    kept.has(specifiers[i]!),
                );
                // The module is still evaluated where the statement stood.
                return remaining.length
                    ? [{ ...statement, specifiers: remaining }]
                    : [
                          {
                              kind: "Import",
                              source: statement.source!,
                              specifiers: [],
                              span: statement.span,
                          },
                      ];
            });
            return;
        }
        if (statement.kind === "Export" && statement.specifiers) {
            const list = statement.specifiers;
            const specifiers = list.map((s) => {
                const unit = add(
                    {
                        label: s.exported,
                        usage: `${s.local} ${s.exported}`,
                        root: false,
                    },
                    s.localId ?? null,
                );
                if (!s.localId) units[unit]!.refs.add(s.local);
                exports.set(s.exported, { unit });
                return unit;
            });
            emit.push((kept) => {
                const remaining = list.filter((_, i) =>
                    kept.has(specifiers[i]!),
                );
                return remaining.length
                    ? [{ ...statement, specifiers: remaining }]
                    : [];
            });
            return;
        }
        if (statement.kind === "Export" && statement.defaultExpression) {
            const expression = statement.defaultExpression,
                name = statement.defaultId!.name;
            defaultAggregate = ![
                "Identifier",
                "FunctionExpression",
                "ClassExpression",
                "Literal",
            ].includes(expression.kind);
            const unit = add(
                {
                    label: "default",
                    usage: whole,
                    root: !pure(expression, context),
                },
                expression,
                [name],
            );
            exports.set("default", { binding: name });
            emit.push((kept) => (kept.has(unit) ? [statement] : []));
            return;
        }
        const declaration =
            statement.kind === "Export" ? statement.declaration : statement;
        const exported = statement.kind === "Export";
        if (declaration?.kind === "Function") {
            const unit = add(
                { label: declaration.id.name, usage: whole, root: false },
                declaration,
                [declaration.id.name],
            );
            if (exported)
                exports.set(
                    statement.kind === "Export" && statement.isDefault
                        ? "default"
                        : declaration.id.name,
                    { binding: declaration.id.name },
                );
            emit.push((kept) => (kept.has(unit) ? [statement] : []));
            return;
        }
        if (declaration?.kind === "Class") {
            if (!classPure(declaration)) {
                root();
                if (exported)
                    exports.set(
                        statement.kind === "Export" && statement.isDefault
                            ? "default"
                            : declaration.id.name,
                        { binding: declaration.id.name },
                    );
                return;
            }
            const unit = add(
                { label: declaration.id.name, usage: whole, root: false },
                declaration,
                [declaration.id.name],
            );
            if (exported)
                exports.set(
                    statement.kind === "Export" && statement.isDefault
                        ? "default"
                        : declaration.id.name,
                    { binding: declaration.id.name },
                );
            emit.push((kept) => (kept.has(unit) ? [statement] : []));
            return;
        }
        if (declaration?.kind === "Var") {
            if (
                declaration.declarations.some((d) => d.id.kind !== "Identifier")
            ) {
                root();
                if (exported)
                    for (const d of declaration.declarations)
                        for (const id of boundNames(d.id))
                            exports.set(id.name, { binding: id.name });
                return;
            }
            const declarators = declaration.declarations.map((d, ordinal) => {
                const name = (d.id as A.Identifier).name;
                if (exported) exports.set(name, { binding: name });
                const usage = spanOf(d.id, d.init);
                if (tracked.has(name)) {
                    const literal = d.init as A.ObjectLiteral,
                        members = new Map<string, number>();
                    propUnits.set(name, members);
                    const properties = literal.properties.map((p) => {
                        const property = p as Exclude<
                            A.ObjectLiteral["properties"][number],
                            { spread: A.Expression }
                        >;
                        const key = stringKey(property.key)!;
                        const unit = add(
                            {
                                label: `${name}.${key}`,
                                usage: spanOf(property.key, property.value),
                                root: false,
                            },
                            property.value,
                        );
                        members.set(key, unit);
                        return unit;
                    });
                    const unit = add(
                        { label: name, usage: d.id.span, root: false },
                        null,
                        [name],
                    );
                    return {
                        unit,
                        rebuild: (kept: Set<number>) => ({
                            ...d,
                            init: {
                                ...literal,
                                properties: literal.properties.filter((_, i) =>
                                    kept.has(properties[i]!),
                                ),
                            },
                        }),
                    };
                }
                const unit = add(
                    {
                        label: name,
                        usage,
                        root:
                            d.init !== null &&
                            !pure(d.init, { at: [index, ordinal] }),
                    },
                    d.init,
                    [name],
                );
                return { unit, rebuild: () => d };
            });
            emit.push((kept) => {
                const remaining = declarators
                    .filter((d) => kept.has(d.unit))
                    .map((d) => d.rebuild(kept));
                if (!remaining.length) return [];
                const var_ = { ...declaration, declarations: remaining };
                return [
                    statement.kind === "Export"
                        ? { ...statement, declaration: var_ }
                        : var_,
                ];
            });
            return;
        }
        if (statement.kind === "ExpressionStatement") {
            const targets = initializer(statement, context);
            if (targets) {
                const unit = add(
                    {
                        label: targets
                            .map(([t, key]) => `${t}.${key}=`)
                            .join(""),
                        usage: whole,
                        root: false,
                    },
                    statement,
                    targets.map(([t]) => t),
                );
                emit.push((kept) => (kept.has(unit) ? [statement] : []));
                return;
            }
        }
        root();
    });
    return {
        record,
        units,
        bindings,
        propUnits,
        exports,
        defaultAggregate,
        emit,
        kept: new Set(),
        full: false,
    };
}

/**
 * Analyses a module until the set of constants that root statements may
 * mutate is stable: a root may pass an object to code that adds accessors,
 * so its data properties are no longer read without effects.
 */
function analyzeStable(record: ModuleRecord): Analysis | null {
    let mutated = new Set<string>();
    for (;;) {
        const analysis = analyze(record, mutated);
        if (!analysis) return null;
        const reached = new Set<string>(),
            pending = analysis.units
                .map((unit, index) => (unit.root ? index : -1))
                .filter((index) => index >= 0),
            seen = new Set(pending);
        while (pending.length) {
            const unit = analysis.units[pending.pop()!]!;
            for (const name of [
                ...unit.refs,
                ...unit.props.map(([object]) => object),
            ]) {
                reached.add(name);
                for (const next of analysis.bindings.get(name) ?? [])
                    if (!seen.has(next)) {
                        seen.add(next);
                        pending.push(next);
                    }
            }
        }
        if ([...reached].every((name) => mutated.has(name))) return analysis;
        mutated = new Set([...mutated, ...reached]);
    }
}

/**
 * Removes the code of built-in modules that the program cannot reach and
 * records the lexical usage of what remains (the built-ins' own usage was
 * deferred by loadModuleGraph). `fullDemand` lists modules a script requests.
 */
export function pruneBuiltinModules(
    records: ModuleRecord[],
    options: { fullDemand?: readonly number[]; disabled?: boolean } = {},
): BuiltinPruning[] {
    const analyses = new Map<number, Analysis>();
    if (!options.disabled)
        for (const record of records)
            if (record.builtinAliases) {
                const analysis = analyzeStable(record);
                if (analysis) analyses.set(record.index, analysis);
            }
    const pending: [Analysis, number][] = [];
    const keep = (analysis: Analysis, unit: number) => {
        if (!analysis.kept.has(unit)) {
            analysis.kept.add(unit);
            pending.push([analysis, unit]);
        }
    };
    const keepBinding = (analysis: Analysis, name: string) => {
        for (const unit of analysis.bindings.get(name) ?? [])
            keep(analysis, unit);
    };
    const demand = (index: number, name: string) => {
        const analysis = analyses.get(index);
        if (!analysis || analysis.full) return;
        if (name === "*" || (name === "default" && analysis.defaultAggregate)) {
            analysis.full = true;
            analysis.units.forEach((_, unit) => keep(analysis, unit));
            return;
        }
        const entry = analysis.exports.get(name);
        if (!entry) return;
        if ("unit" in entry) keep(analysis, entry.unit);
        else keepBinding(analysis, entry.binding);
    };
    // Modules kept whole demand what their static imports and re-exports name.
    const whole = (record: ModuleRecord) => {
        for (const statement of record.ast.body) {
            const source =
                statement.kind === "Import" || statement.kind === "Export"
                    ? statement.source
                    : undefined;
            if (source === undefined) continue;
            const from = record.requests.get(source);
            if (from === undefined) continue;
            if (statement.kind === "Import")
                for (const s of statement.specifiers)
                    demand(
                        from,
                        s.kind === "namespace"
                            ? "*"
                            : s.kind === "default"
                              ? "default"
                              : s.imported!,
                    );
            else if (statement.kind === "Export")
                if (statement.star) demand(from, "*");
                else
                    for (const s of statement.specifiers ?? [])
                        demand(from, s.local);
        }
    };
    for (const record of records) {
        for (const index of record.dynamicRequests) demand(index, "*");
        const analysis = analyses.get(record.index);
        if (!analysis) whole(record);
        else
            analysis.units.forEach((unit, index) => {
                if (unit.root) keep(analysis, index);
            });
    }
    for (const index of options.fullDemand ?? []) demand(index, "*");
    while (pending.length) {
        const [analysis, index] = pending.pop()!;
        const unit = analysis.units[index]!;
        for (const name of unit.refs) keepBinding(analysis, name);
        for (const [object, key] of unit.props) {
            keepBinding(analysis, object);
            const member = analysis.propUnits.get(object)?.get(key);
            if (member !== undefined) keep(analysis, member);
        }
        for (const [from, name] of unit.imports) demand(from, name);
    }
    const report: BuiltinPruning[] = [];
    for (const record of records) {
        if (!record.builtinAliases) continue;
        const analysis = analyses.get(record.index);
        if (!analysis || analysis.full) {
            if (record.deferredUsage)
                mergeSourceUsage(
                    record.deferredUsage.usage,
                    record.deferredUsage.reasons,
                );
            report.push({
                path: record.path,
                full: true,
                exports: analysis ? [...analysis.exports.keys()] : [],
                kept: analysis ? analysis.units.map((u) => u.label) : [],
                removed: [],
                roots: analysis
                    ? analysis.units.filter((u) => u.root).map((u) => u.label)
                    : [],
            });
            continue;
        }
        const body = analysis.emit.flatMap((emit) => emit(analysis.kept));
        record.ast = { ...record.ast, body };
        const source = record.ast.source ?? "";
        for (const statement of body)
            if (statement.kind === "Import" || statement.kind === "Export")
                if (statement.source !== undefined)
                    recordSourceUsage(JSON.stringify(statement.source));
        const kept: string[] = [],
            removed: string[] = [];
        analysis.units.forEach((unit, index) => {
            if (!analysis.kept.has(index)) {
                removed.push(unit.label);
                return;
            }
            kept.push(unit.label);
            recordSourceUsage(
                typeof unit.usage === "string"
                    ? unit.usage
                    : source.slice(unit.usage.start, unit.usage.end),
                { module: true },
            );
        });
        report.push({
            path: record.path,
            full: false,
            exports: [...analysis.exports.keys()].filter((name) => {
                const entry = analysis.exports.get(name)!;
                return "unit" in entry
                    ? analysis.kept.has(entry.unit)
                    : (analysis.bindings.get(entry.binding) ?? []).some(
                          (unit) => analysis.kept.has(unit),
                      );
            }),
            kept,
            removed,
            roots: analysis.units.filter((u) => u.root).map((u) => u.label),
        });
    }
    pruningReport?.push(...report);
    return report;
}
