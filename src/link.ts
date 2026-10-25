import type { ModuleIR } from "./ir/model.js";
/**
 * Optional parts of the runtime. The compiler links a part only when the
 * program's sources can reach it (see collectSourceUsage in the lexer);
 * `fullRuntimeLink` links everything.
 */
export interface RuntimeLink {
    /** The RegExp engine: pattern compiler, matcher and case folding. */
    regexp: boolean;
    /** Unicode property tables for \p{…} and \P{…} in RegExp patterns. */
    unicodeProperties: boolean;
    /** The v flag (unicodeSets) class syntax: set operations, nested classes, \q{…}. */
    unicodeSets: boolean;
    /** Emoji sequence data for the properties of strings (\p{RGI_Emoji} …) of v-mode patterns. */
    unicodeStringProperties: boolean;
    /** Unicode normalization tables for String.prototype.normalize, localeCompare and Intl.Collator. */
    unicodeNormalization: boolean;
    /** Half-precision conversions: Math.f16round and DataView get/setFloat16. */
    float16: boolean;
    /** Optional JavaScript preludes (see preludeTriggers). */
    preludes: Record<OptionalPrelude, boolean>;
}
/**
 * Preludes that only install globals or built-in methods. Each is linked when
 * one of its trigger names appears in a source: as an identifier, a property
 * name or a string literal (computed access such as globalThis['Proxy']).
 * Reflect and Promise (which also carries the module and script machinery)
 * are always linked.
 */
export const preludeTriggers = {
    eventEmitter: ["EventEmitter", "nona.events.emitter"],
    stream: [
        "node:stream",
        "nona:stream",
        "streamModule",
        "nona.stream.module",
        "nona.stream.consumers",
        "stdin",
        "stdout",
        "stderr",
        "openStdin",
        "emitWarning",
    ],
    asyncHooks: [
        "AsyncResource",
        "AsyncLocalStorage",
        "executionAsyncId",
        "triggerAsyncId",
        "nona.async_hooks.internal",
    ],
    events: [
        "Event",
        "CustomEvent",
        "EventTarget",
        "AbortController",
        "AbortSignal",
        "DOMException",
        "NodeEventTarget",
        "nona.events.internal",
    ],
    proxy: ["Proxy"],
    errorStack: ["captureStackTrace", "stackTraceLimit", "prepareStackTrace"],
    // Also linked whenever the RegExp engine is (see lowerRuntimePrelude).
    regexpProtocol: ["replaceAll"],
    // RegExp.escape: needs the RegExp constructor, so it is linked with the engine.
    regexpEscape: ["escape"],
    // The JavaScript methods of ArrayBuffer, DataView and the typed arrays. Built-in
    // modules and preludes that hand out binary data name these types in their own
    // sources, and the preludes that do (see preludeDependencies) depend on it.
    binaryData: [
        "ArrayBuffer",
        "SharedArrayBuffer",
        "DataView",
        "Atomics",
        "Int8Array",
        "Uint8Array",
        "Uint8ClampedArray",
        "Int16Array",
        "Uint16Array",
        "Int32Array",
        "Uint32Array",
        "Float16Array",
        "Float32Array",
        "Float64Array",
        "BigInt64Array",
        "BigUint64Array",
        "TypedArray",
    ],
    encoding: ["TextEncoder", "TextDecoder"],
    url: ["URL", "URLSearchParams"],
    buffer: [
        "Buffer",
        "Blob",
        "File",
        "atob",
        "btoa",
        "URL",
        "ReadableStream",
        "ReadableStreamDefaultReader",
        "ReadableStreamBYOBReader",
        "WritableStream",
        "WritableStreamDefaultWriter",
        "node:buffer",
        "nona:buffer",
        "bufferModule",
    ],
    process: ["process"],
    // Timers installs enumerable globals, which a program can list through globalThis.
    timers: [
        "setTimeout",
        "setInterval",
        "setImmediate",
        "clearTimeout",
        "clearInterval",
        "clearImmediate",
        "queueMicrotask",
        "performance",
        "globalThis",
    ],
    // Nona's own Intl for the en locale (#300) and the locale-sensitive methods
    // that delegate to it.
    intl: [
        "Intl",
        "Segmenter",
        "toLocaleString",
        "toLocaleDateString",
        "toLocaleTimeString",
        "localeCompare",
    ],
    // The prelude also adds its methods to Array.prototype[Symbol.unscopables].
    es2021: [
        "at",
        "findLast",
        "findLastIndex",
        "toReversed",
        "toSorted",
        "toSpliced",
        "with",
        "hasOwn",
        "groupBy",
        "AggregateError",
        "any",
        "unscopables",
        "toSorted",
        "toReversed",
        "with",
    ],
    setMethods: [
        "union",
        "intersection",
        "difference",
        "symmetricDifference",
        "isSubsetOf",
        "isSupersetOf",
        "isDisjointFrom",
    ],
    wellFormed: ["isWellFormed", "toWellFormed"],
    // WeakRef and its microtask-checkpoint hook; the native part is linked with it.
    weakRef: ["WeakRef"],
    // FinalizationRegistry and its cleanup jobs; shares the native part of WeakRef.
    finalizationRegistry: ["FinalizationRegistry"],
    // map, filter, reduce, forEach, some, every and find are in almost every
    // program, so only the rarer names select the iterator helpers: a program
    // that calls nothing but e.g. gen().map(f) needs --link iteratorHelpers.
    iteratorHelpers: ["Iterator", "toArray", "take", "drop", "flatMap"],
    annexB: [
        "escape",
        "unescape",
        "substr",
        "setYear",
        "toGMTString",
        "compile",
        "anchor",
        "big",
        "blink",
        "bold",
        "fixed",
        "fontcolor",
        "fontsize",
        "italics",
        "link",
        "small",
        "strike",
        "sub",
        "sup",
    ],
    arrayFromAsync: ["fromAsync"],
    // toSorted of the es2021 prelude sorts with the built-in sort.
    arraySort: ["sort", "toSorted"],
    objectIntegrity: ["freeze", "seal", "isFrozen", "isSealed"],
    objectAnnexB: [
        "__defineGetter__",
        "__defineSetter__",
        "__lookupGetter__",
        "__lookupSetter__",
    ],
    // Native helpers of node:net and node:http, and the hook node:http
    // registers its JSON response path with (#155).
    network: ["__nonaNetParse"],
    // Helpers that syntax needs (#278): no names select them; syntaxHelperParts does.
    withStatement: [],
    evalCode: [],
    classElements: [],
    moduleRecords: [],
    topLevelAwait: [],
    jsonResponse: [],
} as const satisfies Record<string, readonly string[]>;
export type OptionalPrelude = keyof typeof preludeTriggers;
export const optionalPreludes = Object.keys(
    preludeTriggers,
) as OptionalPrelude[];
/** Preludes another prelude needs while it initializes. */
export const preludeDependencies: Partial<
    Record<OptionalPrelude, readonly OptionalPrelude[]>
> = {
    process: ["encoding", "proxy", "timers", "eventEmitter", "binaryData"],
    buffer: ["encoding", "url", "binaryData", "events"],
    url: ["encoding"],
    encoding: ["binaryData"],
    es2021: ["binaryData"],
    events: ["timers"],
    asyncHooks: ["events", "timers"],
    eventEmitter: ["events", "asyncHooks"],
    stream: ["eventEmitter", "buffer", "process"],
    topLevelAwait: ["moduleRecords"],
};
/** Process parses dotenv/memory text and validates masks with original regexes. */
export function runtimeRegExpLink(
    link: RuntimeLink,
    linked: readonly OptionalPrelude[] = [],
) {
    const regexp =
        link.regexp || link.preludes.buffer || linked.includes("process");
    return {
        regexp,
        unicodeProperties: regexp && link.unicodeProperties,
        unicodeSets:
            regexp && (link.unicodeSets || link.unicodeStringProperties),
        unicodeStringProperties: regexp && link.unicodeStringProperties,
    };
}
/**
 * Names that enumerate built-ins: a program using one could observe a missing
 * method, so it links every prelude.
 */
export const reflectiveNames: readonly string[] = [
    "getOwnPropertyNames",
    "getOwnPropertyDescriptors",
    "ownKeys",
];
/**
 * Preludes that add no built-ins, so enumerating built-ins cannot observe
 * them: they are linked only by the syntax that needs them.
 */
export const syntaxOnlyPreludes: readonly OptionalPrelude[] = [
    "topLevelAwait",
    "jsonResponse",
];
export function preludeSet(value: boolean): Record<OptionalPrelude, boolean> {
    return Object.fromEntries(
        optionalPreludes.map((name) => [name, value]),
    ) as Record<OptionalPrelude, boolean>;
}
export const fullRuntimeLink: RuntimeLink = {
    regexp: true,
    unicodeProperties: true,
    unicodeSets: true,
    unicodeStringProperties: true,
    unicodeNormalization: true,
    float16: true,
    preludes: preludeSet(true),
};
/** The hint every "not linked" error ends with. */
export const fullRuntimeHint =
    "Compile with --full-runtime (compile option fullRuntime) to include it.";
/** Every name `--link` accepts: the native parts and the optional preludes. */
export const runtimePartNames: readonly string[] = [
    "regexp",
    "unicodeProperties",
    "unicodeSets",
    "unicodeStringProperties",
    "unicodeNormalization",
    "float16",
    ...optionalPreludes,
];
/**
 * `link` with the named parts added (`--link`, compile option `link`). A
 * program that reaches a part only through names built at run time can link
 * that one part instead of the whole runtime. Unicode properties, the v flag
 * syntax and properties of strings bring the RegExp engine with them;
 * properties of strings bring the v flag syntax.
 */
export function requestLink(
    link: RuntimeLink,
    parts: readonly string[],
): RuntimeLink {
    const result: RuntimeLink = { ...link, preludes: { ...link.preludes } };
    for (const part of parts) {
        if (part === "regexp") result.regexp = true;
        else if (part === "unicodeProperties")
            result.regexp = result.unicodeProperties = true;
        else if (part === "unicodeSets")
            result.regexp = result.unicodeSets = true;
        else if (part === "unicodeStringProperties")
            result.regexp =
                result.unicodeSets =
                result.unicodeStringProperties =
                    true;
        else if (part === "unicodeNormalization")
            result.unicodeNormalization = true;
        else if (part === "float16") result.float16 = true;
        else result.preludes[part as OptionalPrelude] = true;
    }
    return result;
}
/** One linked optional part and the reason it was linked. */
export interface LinkedPart {
    part: string;
    reason: string;
}
/**
 * The optional parts in the order of runtimePartNames, each with its reason:
 * the name in a source that selected it, the option that requested it, or the
 * part that needs it.
 */
export function linkReport(
    link: RuntimeLink,
    reasons: Readonly<Record<string, string>>,
    requested: readonly string[] = [],
    full = false,
): LinkedPart[] {
    const why = new Map<string, string>();
    const set = (part: string, reason: string) => {
        if (!why.has(part)) why.set(part, reason);
    };
    for (const part of requested) set(part, "requested with --link");
    if (requested.includes("unicodeProperties"))
        set("regexp", "needed by unicodeProperties");
    if (requested.includes("unicodeSets"))
        set("regexp", "needed by unicodeSets");
    if (requested.includes("unicodeStringProperties")) {
        set("regexp", "needed by unicodeStringProperties");
        set("unicodeSets", "needed by unicodeStringProperties");
    }
    const selected = optionalPreludes.filter((name) => link.preludes[name]);
    for (const name of selected)
        set(name, full ? "--full-runtime" : (reasons[name] ?? "requested"));
    // Dependencies (as linkedPreludes resolves them in the backend).
    const linked = new Set(selected);
    for (const name of linked)
        for (const dependency of preludeDependencies[name] ?? []) {
            linked.add(dependency);
            set(dependency, `needed by ${name}`);
        }
    const linkedList = optionalPreludes.filter((name) => linked.has(name));
    const regexp = runtimeRegExpLink(link, linkedList);
    if (link.regexp)
        set(
            "regexp",
            full ? "--full-runtime" : (reasons.regexp ?? "requested"),
        );
    else if (regexp.regexp)
        set(
            "regexp",
            `needed by ${link.preludes.buffer ? "buffer" : "process"}`,
        );
    if (regexp.unicodeProperties)
        set(
            "unicodeProperties",
            full
                ? "--full-runtime"
                : (reasons.unicodeProperties ?? "requested"),
        );
    if (regexp.unicodeSets)
        set(
            "unicodeSets",
            full
                ? "--full-runtime"
                : (reasons.unicodeSets ??
                      (link.unicodeSets
                          ? "requested"
                          : "needed by unicodeStringProperties")),
        );
    if (regexp.unicodeStringProperties)
        set(
            "unicodeStringProperties",
            full
                ? "--full-runtime"
                : (reasons.unicodeStringProperties ?? "requested"),
        );
    if (link.unicodeNormalization)
        set(
            "unicodeNormalization",
            full
                ? "--full-runtime"
                : (reasons.unicodeNormalization ?? "requested"),
        );
    if (link.float16)
        set(
            "float16",
            full ? "--full-runtime" : (reasons.float16 ?? "requested"),
        );
    // The RegExp protocol methods come with the engine (backend preludes.ts).
    if (regexp.regexp && !linked.has("regexpProtocol")) {
        linkedList.push("regexpProtocol");
        set("regexpProtocol", "needed by regexp");
    }
    const present = new Set<string>(linkedList);
    if (regexp.regexp) present.add("regexp");
    if (regexp.unicodeProperties) present.add("unicodeProperties");
    if (regexp.unicodeSets) present.add("unicodeSets");
    if (regexp.unicodeStringProperties) present.add("unicodeStringProperties");
    if (link.unicodeNormalization) present.add("unicodeNormalization");
    if (link.float16) present.add("float16");
    return runtimePartNames
        .filter((part) => present.has(part))
        .map((part) => ({ part, reason: why.get(part)! }));
}

/**
 * The prelude part that defines each rt.prelude helper only some syntax
 * needs (#278). The compiler links a part when the lowered program, an
 * agent or a linked prelude calls one of its helpers (requiredSyntaxParts):
 * this is exact, unlike the names of preludeTriggers.
 */
export const syntaxHelperParts: Readonly<Record<string, OptionalPrelude>> = {
    withObject: "withStatement",
    withHasBinding: "withStatement",
    withGetBindingValue: "withStatement",
    withSetMutableBinding: "withStatement",
    isEval: "evalCode",
    evalDeclareVars: "evalCode",
    evalGlobalDeclarations: "evalCode",
    callWithGlobalThis: "evalCode",
    privateName: "classElements",
    privateMethod: "classElements",
    privateBrand: "classElements",
    privateDefine: "classElements",
    privateGet: "classElements",
    privateSet: "classElements",
    privateIn: "classElements",
    initializeFields: "classElements",
    staticMethodKey: "classElements",
    createImportMeta: "moduleRecords",
    createNamespace: "moduleRecords",
    registerModule: "moduleRecords",
    registerScript: "moduleRecords",
    dynamicImport: "moduleRecords",
    endJson: "jsonResponse",
};
/** The syntax helper parts that calls in `modules` need. */
export function requiredSyntaxParts(
    modules: readonly ModuleIR[],
): Set<OptionalPrelude> {
    const parts = new Set<OptionalPrelude>();
    for (const module of modules)
        for (const fn of module.functions)
            for (const block of fn.blocks)
                for (const op of block.operations)
                    if (
                        op.kind === "call" &&
                        op.target.startsWith("rt.prelude.")
                    ) {
                        const part = syntaxHelperParts[op.target.slice(11)];
                        if (part) parts.add(part);
                    }
                    // A module body with top-level await is an async function (#306).
                    else if (
                        op.kind === "newFunction" &&
                        op.async &&
                        op.target.startsWith("js.module.")
                    )
                        parts.add("topLevelAwait");
    return parts;
}
/** `link` with the syntax helper parts that the calls of `module` need. */
export function withSyntaxParts(
    link: RuntimeLink,
    module: ModuleIR,
): RuntimeLink {
    const parts = [...requiredSyntaxParts([module])].filter(
        (part) => !link.preludes[part],
    );
    if (!parts.length) return link;
    const preludes = { ...link.preludes };
    for (const part of parts) preludes[part] = true;
    return { ...link, preludes };
}
