import {
    type RuntimeLink,
    type OptionalPrelude,
    optionalPreludes,
    preludeSet,
    preludeTriggers,
    reflectiveNames,
    syntaxOnlyPreludes,
} from "../link.js";
import type * as A from "./ast.js";
import { boundNames, collectDeclarations } from "./declarations.js";

/**
 * What the parsed sources can reach of the optional runtime parts (#438).
 * Selection follows the resolved AST rather than the tokens: a name selects a
 * part when it is a free identifier (a global or built-in reference), a
 * property name (a.x, a?.x, super.x, destructuring keys, import and export
 * names) or a string in a key position (a["x"], "x" in a, reflection calls,
 * module specifiers, Symbol.for). A local binding and ordinary string data
 * select nothing, except through the program-wide dynamic-key fallback: when
 * any source accesses a property with a key that is neither a literal nor
 * obviously numeric, every string that names a trigger is linked.
 *
 * A RegExp object can only be created by a literal, by the RegExp constructor
 * or by String.prototype.match/matchAll/search with a string argument. The
 * normalization tables are reached only through normalize, localeCompare and
 * Intl.Collator (number formatting through toLocaleString does not need them).
 */
export type SourceUsage = RuntimeLink;
/** Runtime part (regexp, unicodeProperties, unicodeSets, unicodeStringProperties, unicodeNormalization, float16 or a prelude name) → why it is linked. */
export type LinkReasons = Record<string, string>;

const regexpNames = ["RegExp", "match", "matchAll", "search"],
    normalizationNames = ["normalize", "localeCompare", "Intl", "Collator"],
    float16Names = ["Float16Array", "f16round", "getFloat16", "setFloat16"];
const unicodePropertyEscape = /\\[pP]\{/;
// The properties of strings of v-mode patterns (\p{RGI_Emoji} …): their
// emoji data is linked only when a literal or a string names one of them.
const stringPropertyName = /RGI_Emoji|Basic_Emoji|Emoji_Keycap_Sequence/;
// The v-mode class syntax is linked by a v flag literal or a string that may
// be the flags of new RegExp(pattern, "v").
const unicodeSetsFlags = /^[dgimsy]*v[dgimsy]*$/;
// A group name with a non-ASCII character or an escape is validated against
// the ID_Start/ID_Continue property tables.
const unicodeGroupName = /(?:\(\?|\\k)<(?![=!])[^>]*(?:[^\x00-\x7f]|\\u)/;

let usage: SourceUsage | undefined;
/** Why each part was linked: the first name that selected it (see LinkReasons). */
let reasons: LinkReasons | undefined;
/** Data strings that name a trigger: linked only by the dynamic-key fallback. */
let candidates: Set<string> | undefined;
/** Whether a source accesses a property with a key unknown at compile time. */
let dynamicKey = false;

function note(part: string, why: string): void {
    if (reasons && !(part in reasons)) reasons[part] = why;
}
function linkPrelude(name: OptionalPrelude, why: string): void {
    if (!usage) return;
    usage.preludes[name] = true;
    note(name, why);
}
function linkRegExp(
    why: string,
    unicodeProperties: boolean,
    stringProperties = false,
): void {
    if (!usage) return;
    usage.regexp = true;
    note("regexp", why);
    if (unicodeProperties) linkUnicodeProperties(why);
    if (stringProperties) {
        usage.unicodeStringProperties = true;
        note("unicodeStringProperties", why);
    }
}
function linkUnicodeProperties(why: string): void {
    if (!usage) return;
    usage.unicodeProperties = true;
    note("unicodeProperties", why);
}
function linkUnicodeSets(why: string): void {
    if (!usage) return;
    usage.unicodeSets = true;
    note("unicodeSets", why);
}
function linkFloat16(why: string): void {
    if (!usage) return;
    usage.float16 = true;
    note("float16", why);
}
/** Select a runtime dependency discovered from parsed source expressions. */
export function requireRuntimePrelude(name: OptionalPrelude): void {
    linkPrelude(name, "used by the program's syntax");
}
// Enumeration links every available prelude. Explicit names still request
// unavailable host adapters, allowing the compiler to diagnose that request.
let unavailableReflectivePreludes: readonly OptionalPrelude[] = [];
/** Runs `run` and reports what every source parsed during it can use. */
export function collectSourceUsage<T>(
    run: () => T,
    options: {
        unavailableReflectivePreludes?: readonly OptionalPrelude[];
    } = {},
): { result: T; usage: SourceUsage; reasons: LinkReasons } {
    const outer = usage,
        outerReasons = reasons,
        outerCandidates = candidates,
        outerDynamicKey = dynamicKey,
        currentReasons: LinkReasons = {},
        currentCandidates = new Set<string>(),
        current: SourceUsage = {
            regexp: false,
            unicodeProperties: false,
            unicodeSets: false,
            unicodeStringProperties: false,
            unicodeNormalization: false,
            float16: false,
            preludes: preludeSet(false),
        };
    const outerUnavailable = unavailableReflectivePreludes;
    unavailableReflectivePreludes =
        options.unavailableReflectivePreludes ?? outerUnavailable;
    usage = current;
    reasons = currentReasons;
    candidates = currentCandidates;
    dynamicKey = false;
    let currentDynamicKey = false;
    try {
        const result = run();
        // The strings are linked once every source is known; an enclosing
        // collection decides again over its own sources and these.
        if (dynamicKey)
            for (const text of currentCandidates)
                selectName(
                    text,
                    `${JSON.stringify(text)} in a string (dynamic property access)`,
                );
        return { result, usage: current, reasons: currentReasons };
    } finally {
        currentDynamicKey = dynamicKey;
        usage = outer;
        reasons = outerReasons;
        candidates = outerCandidates;
        dynamicKey = outerDynamicKey || (!!outer && currentDynamicKey);
        if (outerReasons)
            for (const [part, why] of Object.entries(currentReasons))
                if (!(part in outerReasons)) outerReasons[part] = why;
        if (outerCandidates)
            for (const text of currentCandidates) outerCandidates.add(text);
        unavailableReflectivePreludes = outerUnavailable;
        if (outer) {
            outer.regexp ||= current.regexp;
            outer.unicodeProperties ||= current.unicodeProperties;
            outer.unicodeSets ||= current.unicodeSets;
            outer.unicodeStringProperties ||= current.unicodeStringProperties;
            outer.unicodeNormalization ||= current.unicodeNormalization;
            outer.float16 ||= current.float16;
            for (const name of optionalPreludes)
                outer.preludes[name] ||= current.preludes[name];
        }
    }
}
/** Trigger name → the preludes it links (see preludeTriggers). */
const preludeByName = new Map<string, OptionalPrelude[]>();
for (const name of optionalPreludes)
    for (const trigger of preludeTriggers[name]) {
        const list = preludeByName.get(trigger) ?? [];
        if (!list.includes(name)) list.push(name);
        preludeByName.set(trigger, list);
    }
function isTrigger(name: string): boolean {
    return (
        regexpNames.includes(name) ||
        normalizationNames.includes(name) ||
        float16Names.includes(name) ||
        preludeByName.has(name) ||
        reflectiveNames.includes(name)
    );
}
/** Applies every trigger list to a name the program can reach. */
function selectName(name: string, why: string): void {
    if (!usage) return;
    // A pattern built at run time may use any Unicode property.
    if (regexpNames.includes(name)) linkRegExp(why, true);
    if (normalizationNames.includes(name)) {
        usage.unicodeNormalization = true;
        note("unicodeNormalization", why);
    }
    if (float16Names.includes(name)) linkFloat16(why);
    if (reflectiveNames.includes(name)) {
        // Enumerating Math or DataView.prototype would observe the methods.
        const enumerate = `${JSON.stringify(name)} can enumerate built-ins`;
        linkFloat16(enumerate);
        for (const prelude of optionalPreludes)
            if (
                !unavailableReflectivePreludes.includes(prelude) &&
                !syntaxOnlyPreludes.includes(prelude)
            )
                linkPrelude(prelude, enumerate);
    }
    for (const prelude of preludeByName.get(name) ?? [])
        linkPrelude(prelude, why);
}
const inSource = (name: string) => `${JSON.stringify(name)} in the source`,
    inString = (name: string) => `${JSON.stringify(name)} in a string`;
/** Regular-expression data in any string: the engine itself comes only from names. */
function recordString(text: string): void {
    if (!usage) return;
    if (unicodePropertyEscape.test(text))
        linkUnicodeProperties("a \\p{…} escape inside a string");
    if (unicodeSetsFlags.test(text))
        linkUnicodeSets(`the flags ${JSON.stringify(text)} in a string`);
    const stringProperty = stringPropertyName.exec(text);
    if (stringProperty) {
        usage.unicodeStringProperties = true;
        note(
            "unicodeStringProperties",
            `${JSON.stringify(stringProperty[0])} inside a string`,
        );
    }
    if (isTrigger(text)) candidates?.add(text);
}

interface Scope {
    parent: Scope | undefined;
    names: Set<string>;
    /** Bindings that hold a number (a for counter initialised with one). */
    numeric?: Set<string>;
    /** A with body, or a function or program with direct eval: every name may be a property. */
    dynamic?: boolean;
    /** Function or program scope (where direct eval declares). */
    variable?: boolean;
}
// Property-reflection methods: the argument at the index is a property key.
const reflectKeyMethods = new Set([
    "get",
    "set",
    "has",
    "deleteProperty",
    "getOwnPropertyDescriptor",
    "defineProperty",
]);
const objectKeyMethods = new Set([
    "getOwnPropertyDescriptor",
    "defineProperty",
    "hasOwn",
]);
const receiverKeyMethods = new Set([
    "hasOwnProperty",
    "propertyIsEnumerable",
    "__lookupGetter__",
    "__lookupSetter__",
    "__defineGetter__",
    "__defineSetter__",
]);
const numericOperators = new Set([
    "-",
    "*",
    "/",
    "%",
    "**",
    "|",
    "&",
    "^",
    "<<",
    ">>",
    ">>>",
]);
const literalName = (node: A.Expression | undefined): string | undefined =>
    node?.kind === "Literal" && typeof node.value === "string"
        ? node.value
        : node?.kind === "Template" && node.expressions.length === 0
          ? node.quasis[0]
          : undefined;

/**
 * Records what a parsed program can reach (see SourceUsage). The parser calls
 * it for every program while a collection is active; `computed` holds its
 * computed member expressions (a["x"]), whose names are strings.
 */
export function recordProgramUsage(
    program: A.Program,
    computed?: WeakSet<A.Member>,
): void {
    if (!usage) return;
    new UsageWalker(computed).program(program);
}

class UsageWalker {
    private refs: { name: string; scope: Scope }[] = [];
    constructor(private computed: WeakSet<A.Member> | undefined) {}

    program(program: A.Program): void {
        const declarations = collectDeclarations(
            program.body,
            program.module ? "lexical" : "var",
        );
        const scope: Scope = {
            parent: undefined,
            names: new Set(),
            variable: true,
        };
        for (const lexical of declarations.lexicals)
            scope.names.add(lexical.name);
        for (const fn of declarations.bodyFunctions)
            scope.names.add(fn.id.name);
        // A script's var only names a property of the global object, which
        // may still hold the built-in; a module's var is its own binding.
        if (program.module)
            for (const id of declarations.vars) scope.names.add(id.name);
        for (const statement of program.body)
            if (statement.kind === "Import")
                for (const specifier of statement.specifiers)
                    scope.names.add(specifier.local.name);
        this.statements(program.body, scope);
        for (const { name, scope } of this.refs)
            if (this.free(name, scope)) selectName(name, inSource(name));
    }

    private free(name: string, scope: Scope): boolean {
        let declared = false;
        for (let s: Scope | undefined = scope; s; s = s.parent) {
            if (s.dynamic) return true;
            if (!declared && s.names.has(name)) declared = true;
        }
        return !declared;
    }
    private declaring(name: string, scope: Scope): Scope | undefined {
        for (let s: Scope | undefined = scope; s; s = s.parent)
            if (s.names.has(name)) return s;
        return undefined;
    }
    private numeric(node: A.Expression, scope: Scope): boolean {
        switch (node.kind) {
            case "Literal":
                return typeof node.value !== "string";
            case "Update":
                return true;
            case "Unary":
                return (
                    node.operator === "-" ||
                    node.operator === "+" ||
                    node.operator === "~"
                );
            case "Binary":
                return numericOperators.has(node.operator)
                    ? true
                    : node.operator === "+" &&
                          this.numeric(node.left, scope) &&
                          this.numeric(node.right, scope);
            case "Member":
                return literalName(node.property) === "length";
            case "Identifier": {
                const declaring = this.declaring(node.name, scope);
                if (!declaring) return false;
                for (let s: Scope | undefined = scope; s; s = s.parent) {
                    if (s.numeric?.has(node.name)) return true;
                    if (s === declaring) break;
                }
                return false;
            }
            default:
                return false;
        }
    }
    /** A computed property key: a string selects by name, anything unknown is dynamic. */
    private key(node: A.Expression, scope: Scope): void {
        const name = literalName(node);
        if (name !== undefined) selectName(name, inString(name));
        else if (node.kind !== "PrivateName" && !this.numeric(node, scope))
            dynamicKey = true;
    }

    private block(statements: readonly A.Statement[], parent: Scope): void {
        const scope: Scope = { parent, names: new Set() };
        for (const raw of statements) {
            let statement = raw;
            while (statement.kind === "Labeled") statement = statement.body;
            if (statement.kind === "Var" && statement.declarationKind !== "var")
                for (const d of statement.declarations)
                    for (const id of boundNames(d.id)) scope.names.add(id.name);
            else if (
                statement.kind === "Function" ||
                statement.kind === "Class"
            )
                scope.names.add(statement.id.name);
        }
        this.statements(statements, scope);
    }
    private statements(statements: readonly A.Statement[], scope: Scope): void {
        for (const statement of statements) this.statement(statement, scope);
    }
    private statement(node: A.Statement, scope: Scope): void {
        switch (node.kind) {
            case "Block":
                this.block(node.body, scope);
                return;
            case "Var":
                this.declaration(node, scope);
                return;
            case "Function":
                this.function(node, scope);
                return;
            case "Class":
                this.class(node, scope);
                return;
            case "ExpressionStatement":
                this.expression(node.expression, scope);
                return;
            case "If":
                this.expression(node.test, scope);
                this.nested(node.consequent, scope);
                if (node.alternate) this.nested(node.alternate, scope);
                return;
            case "While":
            case "DoWhile":
                this.expression(node.test, scope);
                this.nested(node.body, scope);
                return;
            case "Labeled":
                this.nested(node.body, scope);
                return;
            case "With": {
                this.expression(node.object, scope);
                this.nested(node.body, {
                    parent: scope,
                    names: new Set(),
                    dynamic: true,
                });
                return;
            }
            case "Switch": {
                this.expression(node.discriminant, scope);
                const inner: Scope = { parent: scope, names: new Set() };
                for (const clause of node.cases)
                    for (const statement of clause.body)
                        if (
                            statement.kind === "Var" &&
                            statement.declarationKind !== "var"
                        )
                            for (const d of statement.declarations)
                                for (const id of boundNames(d.id))
                                    inner.names.add(id.name);
                        else if (
                            statement.kind === "Function" ||
                            statement.kind === "Class"
                        )
                            inner.names.add(statement.id.name);
                for (const clause of node.cases) {
                    if (clause.test) this.expression(clause.test, inner);
                    this.statements(clause.body, inner);
                }
                return;
            }
            case "For": {
                const inner = this.loopScope(node.init, scope);
                if (node.init?.kind === "Var") {
                    this.declaration(node.init, inner);
                    // for (let i = 0; …) a[i]: the counter is a number.
                    for (const d of node.init.declarations)
                        if (
                            d.id.kind === "Identifier" &&
                            d.init &&
                            this.numeric(d.init, inner)
                        )
                            (inner.numeric ??= new Set()).add(d.id.name);
                } else if (node.init) this.expression(node.init, inner);
                if (node.test) this.expression(node.test, inner);
                if (node.update) this.expression(node.update, inner);
                this.nested(node.body, inner);
                return;
            }
            case "ForIn":
            case "ForOf": {
                const inner = this.loopScope(node.left, scope);
                if (node.left.kind === "Var")
                    this.declaration(node.left, inner);
                else this.target(node.left, inner);
                this.expression(node.right, inner);
                this.nested(node.body, inner);
                return;
            }
            case "Try": {
                this.block(node.body.body, scope);
                if (node.handler) {
                    const inner: Scope = { parent: scope, names: new Set() };
                    if (node.parameter) {
                        for (const id of boundNames(node.parameter))
                            inner.names.add(id.name);
                        this.pattern(node.parameter, inner);
                    }
                    this.block(node.handler.body, inner);
                }
                if (node.finalizer) this.block(node.finalizer.body, scope);
                return;
            }
            case "Return":
            case "Throw":
                if (node.argument) this.expression(node.argument, scope);
                return;
            case "Import":
                selectName(node.source, inString(node.source));
                for (const specifier of node.specifiers)
                    if (specifier.imported !== undefined)
                        selectName(
                            specifier.imported,
                            inSource(specifier.imported),
                        );
                return;
            case "Export":
                if (node.source !== undefined)
                    selectName(node.source, inString(node.source));
                if (node.namespace !== undefined)
                    selectName(node.namespace, inSource(node.namespace));
                for (const specifier of node.specifiers ?? []) {
                    if (node.source !== undefined)
                        selectName(specifier.local, inSource(specifier.local));
                    else this.reference(specifier.local, scope);
                    selectName(
                        specifier.exported,
                        inSource(specifier.exported),
                    );
                }
                if (node.declaration) this.statement(node.declaration, scope);
                if (node.defaultExpression)
                    this.expression(node.defaultExpression, scope);
                return;
            case "Empty":
            case "Debugger":
            case "Break":
            case "Continue":
                return;
            default:
                this.generic(node, scope);
        }
    }
    /** A statement in a position of its own (if, loop and label bodies). */
    private nested(node: A.Statement, scope: Scope): void {
        if (node.kind === "Function" || node.kind === "Class")
            this.block([node], scope);
        else this.statement(node, scope);
    }
    private loopScope(
        head: A.Var | A.Node | null | undefined,
        parent: Scope,
    ): Scope {
        const scope: Scope = { parent, names: new Set() };
        if (head?.kind === "Var" && (head as A.Var).declarationKind !== "var")
            for (const d of (head as A.Var).declarations)
                for (const id of boundNames(d.id)) scope.names.add(id.name);
        return scope;
    }
    private declaration(node: A.Var, scope: Scope): void {
        for (const d of node.declarations) {
            this.pattern(d.id, scope);
            if (d.init) this.expression(d.init, scope);
        }
    }
    /** A binding pattern: its names are declared; keys are property names. */
    private pattern(node: A.BindingPattern, scope: Scope): void {
        this.patternOrTarget(node, scope, false);
    }
    /** An assignment target: its identifiers are references. */
    private target(
        node: A.Assignable | A.ArrayPattern | A.ObjectPattern,
        scope: Scope,
    ): void {
        this.patternOrTarget(node, scope, true);
    }
    private patternOrTarget(
        node: A.BindingPattern,
        scope: Scope,
        assignment: boolean,
    ): void {
        switch (node.kind) {
            case "Identifier":
                if (assignment) this.reference(node.name, scope);
                return;
            case "Member":
                this.expression(node, scope);
                return;
            case "ArrayPattern":
                for (const element of node.elements)
                    if (element) this.element(element, scope, assignment);
                if (node.rest)
                    this.patternOrTarget(node.rest, scope, assignment);
                return;
            case "ObjectPattern":
                for (const property of node.properties) {
                    if (property.computed) {
                        this.expression(property.key, scope);
                        this.key(property.key, scope);
                    } else {
                        // const {normalize} = String.prototype reads the property.
                        const name = literalName(property.key);
                        if (name !== undefined)
                            selectName(name, inSource(name));
                    }
                    this.element(property.value, scope, assignment);
                }
                if (node.rest)
                    this.patternOrTarget(node.rest, scope, assignment);
                return;
        }
    }
    private element(
        element: A.BindingElement,
        scope: Scope,
        assignment: boolean,
    ): void {
        this.patternOrTarget(element.id, scope, assignment);
        if (element.init) this.expression(element.init, scope);
    }
    private reference(name: string, scope: Scope): void {
        this.refs.push({ name, scope });
    }

    private function(node: A.FunctionNode, parent: Scope): void {
        let outer = parent;
        // A named function expression binds its own name.
        if (node.kind === "FunctionExpression" && node.id)
            outer = { parent, names: new Set([node.id.name]) };
        const scope: Scope = {
            parent: outer,
            names: new Set(["arguments"]),
            variable: !(node.kind === "FunctionExpression" && node.arrow),
        };
        for (const parameter of node.parameters)
            for (const id of boundNames(parameter)) scope.names.add(id.name);
        if (node.rest)
            for (const id of boundNames(node.rest)) scope.names.add(id.name);
        const declarations = collectDeclarations(node.body.body, "var");
        for (const lexical of declarations.lexicals)
            scope.names.add(lexical.name);
        for (const id of declarations.vars) scope.names.add(id.name);
        for (const fn of declarations.bodyFunctions)
            scope.names.add(fn.id.name);
        node.parameters.forEach((parameter, index) => {
            this.pattern(parameter, scope);
            const init = node.defaults?.[index];
            if (init) this.expression(init, scope);
        });
        if (node.rest) this.pattern(node.rest, scope);
        this.statements(node.body.body, scope);
    }
    private class(node: A.ClassDeclaration | A.ClassExpression, parent: Scope) {
        const scope: Scope =
            node.kind === "ClassExpression" && node.id
                ? { parent, names: new Set([node.id.name]) }
                : parent;
        if (node.superClass) this.expression(node.superClass, scope);
        for (const method of node.methods) {
            // Keys a class defines select nothing; computed keys are code.
            if (method.computed) this.expression(method.key, scope);
            if (method.value) this.function(method.value, scope);
        }
        this.function(node.constructorMethod, scope);
        if (node.instanceInitializer)
            this.function(node.instanceInitializer, scope);
    }

    private expression(node: A.Expression, scope: Scope): void {
        switch (node.kind) {
            case "Identifier":
                this.reference(node.name, scope);
                return;
            case "Literal":
                if (typeof node.value === "string") recordString(node.value);
                return;
            case "RegExpLiteral":
                linkRegExp(
                    "a regular expression literal",
                    unicodePropertyEscape.test(node.pattern) ||
                        unicodeGroupName.test(node.pattern),
                    stringPropertyName.test(node.pattern),
                );
                if (node.flags.includes("v"))
                    linkUnicodeSets(
                        "a regular expression literal with the v flag",
                    );
                return;
            case "Template":
                for (const quasi of node.quasis) recordString(quasi);
                for (const e of node.expressions) this.expression(e, scope);
                return;
            case "TaggedTemplate":
                this.expression(node.tag, scope);
                for (const quasi of node.quasis)
                    if (quasi !== undefined) recordString(quasi);
                for (const quasi of node.rawQuasis) recordString(quasi);
                for (const e of node.expressions) this.expression(e, scope);
                return;
            case "Member":
                this.expression(node.object, scope);
                this.property(node.property, !!this.computed?.has(node), scope);
                return;
            case "OptionalChain":
                this.expression(node.base, scope);
                for (const link of node.links)
                    if (link.kind === "property")
                        this.property(link.property, link.computed, scope);
                    else
                        for (const argument of link.arguments)
                            this.argument(argument, scope);
                return;
            case "Binary": {
                // Long a + b + … chains are left-nested: walk them iteratively.
                const rights: A.Expression[] = [];
                let left: A.Expression = node;
                while (left.kind === "Binary") {
                    if (left.operator === "in") this.key(left.left, scope);
                    rights.push(left.right);
                    left = left.left;
                }
                if (left.kind !== "PrivateName") this.expression(left, scope);
                for (let i = rights.length - 1; i >= 0; i--)
                    this.expression(rights[i]!, scope);
                return;
            }
            case "Call":
            case "New":
                this.call(node, scope);
                return;
            case "Assignment":
                this.target(node.left, scope);
                this.expression(node.right, scope);
                return;
            case "ImportCall": {
                const name = literalName(node.argument);
                if (name !== undefined) selectName(name, inString(name));
                this.expression(node.argument, scope);
                return;
            }
            case "FunctionExpression":
                this.function(node, scope);
                return;
            case "ClassExpression":
                this.class(node, scope);
                return;
            case "ObjectLiteral":
                for (const property of node.properties)
                    if ("spread" in property)
                        this.expression(property.spread, scope);
                    else {
                        // Keys an object literal defines select nothing.
                        if (property.computed)
                            this.expression(property.key, scope);
                        this.expression(property.value, scope);
                    }
                return;
            case "PrivateName":
            case "This":
            case "Super":
            case "NewTarget":
            case "ImportMeta":
                return;
            case "ClassFieldDefinition":
                if (node.value) this.expression(node.value, scope);
                return;
            default:
                this.generic(node, scope);
        }
    }
    private property(property: A.Expression, computed: boolean, scope: Scope) {
        if (property.kind === "PrivateName") return;
        const name = literalName(property);
        if (name !== undefined) {
            selectName(name, computed ? inString(name) : inSource(name));
            if (computed) recordString(name);
            return;
        }
        this.expression(property, scope);
        this.key(property, scope);
    }
    private argument(argument: A.Argument, scope: Scope): void {
        if (argument.kind === "SpreadElement")
            this.expression(argument.argument, scope);
        else this.expression(argument, scope);
    }
    private call(node: A.Call | A.New, scope: Scope): void {
        const callee = node.callee;
        this.expression(callee, scope);
        node.arguments.forEach((argument) => this.argument(argument, scope));
        if (node.kind !== "Call") return;
        // Direct eval may declare names or read any of them.
        if (callee.kind === "Identifier" && callee.name === "eval") {
            let s: Scope | undefined = scope;
            while (s && !s.variable) s = s.parent;
            if (s) s.dynamic = true;
            return;
        }
        let index = -1,
            dynamic = true;
        if (callee.kind === "Identifier" && callee.name === "require") {
            index = 0;
            dynamic = false;
        } else if (callee.kind === "Member") {
            const method = literalName(callee.property),
                object = callee.object;
            const objectName =
                object.kind === "Identifier" ? object.name : undefined;
            if (method === undefined) return;
            if (objectName === "Reflect" && reflectKeyMethods.has(method))
                index = 1;
            else if (objectKeyMethods.has(method)) index = 1;
            else if (receiverKeyMethods.has(method)) index = 0;
            else if (method === "for" && objectName === "Symbol") {
                index = 0;
                dynamic = false;
            } else if (
                (method === "call" || method === "apply") &&
                object.kind === "Member" &&
                receiverKeyMethods.has(literalName(object.property) ?? "")
            )
                index = method === "call" ? 1 : -1;
        }
        const argument = node.arguments[index];
        if (!argument) return;
        if (argument.kind === "SpreadElement") {
            if (dynamic) dynamicKey = true;
            return;
        }
        const name = literalName(argument);
        if (name !== undefined) selectName(name, inString(name));
        else if (dynamic) this.key(argument, scope);
    }
    /** Nodes without names of their own: walk every child. */
    private generic(node: A.Node, scope: Scope): void {
        for (const [key, value] of Object.entries(node)) {
            if (key === "span" || key === "kind") continue;
            for (const child of Array.isArray(value) ? value : [value])
                if (
                    child &&
                    typeof child === "object" &&
                    typeof child.kind === "string" &&
                    typeof child.span === "object"
                ) {
                    if (statementKinds.has(child.kind))
                        this.statement(child as A.Statement, scope);
                    else this.expression(child as A.Expression, scope);
                }
        }
    }
}
const statementKinds = new Set([
    "Throw",
    "With",
    "Import",
    "Export",
    "Try",
    "Block",
    "Var",
    "Function",
    "Class",
    "ExpressionStatement",
    "If",
    "While",
    "DoWhile",
    "Switch",
    "Labeled",
    "For",
    "ForIn",
    "ForOf",
    "Return",
    "Empty",
    "Debugger",
    "Break",
    "Continue",
]);
