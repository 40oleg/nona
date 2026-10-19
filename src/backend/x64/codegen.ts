import { createAssembler, currentNativeTarget } from "../machine/context.js";
import {
    HandlerLayout as H,
    preservedGp,
    preservedXmm,
} from "../../runtime/exception-layout.js";
import {
    ObjectLayout as O,
    PropertyLayout as P,
    PropertyAttributes as A,
} from "../../runtime/object-layout.js";
import {
    Assembler,
    assemblerSerial,
    reserveAssemblerSerial,
    setCallCounter,
    setAssemblyListing,
    type Mem,
} from "./assembler.js";
import type {
    NativeProgram,
    NamedFragment,
    UnwindFunction,
} from "../machine/model.js";
import type { ModuleIR, FunctionIR } from "../../ir/model.js";
import { emitRuntime } from "../../runtime/index.js";
import { failIf } from "../../runtime/abi.js";
import { RootLayout as R } from "../../runtime/heap-layout.js";
import { StackBudget } from "../../runtime/context-switch.js";
import { FunctionLayout, FunctionKind } from "../../runtime/functions.js";
import { addCoverage, type CoverageOptions } from "./coverage.js";
import { renderListing } from "./listing.js";
import {
    runtimeRegExpLink,
    withSyntaxParts,
    fullRuntimeLink,
    type RuntimeLink,
} from "../../link.js";
import { processHostDeclarations } from "../../runtime/process-source.js";
import {
    processNativeHelpers,
    captureProcessStartup,
} from "../../runtime/process-host.js";
import {
    weakRefNativeHelpers,
    gcCountNativeHelper,
} from "../../runtime/weak-ref.js";
import { ffiImportSymbol } from "../../ffi.js";
import { cloneRealms, realmSymbol } from "../realms.js";
import { mergeAgentPrograms, agentSymbol } from "../agents.js";
import { stringLiteral } from "../../runtime/value.js";
import { emitFfi } from "../../runtime/ffi.js";
import { emitFunction as emitFunctionCode } from "./operations.js";
import { linkedPreludes, lowerRuntimePrelude } from "./preludes.js";
import {
    baseImages,
    type BaseImage,
    type BaseImageCache,
} from "./base-image.js";

export type { BaseImage, BaseImageCache } from "./base-image.js";

const stack = (disp: number): Mem => ({ base: "rsp", disp });

// NONA_GC_STRESS=off turns the tests' gcStress builds into normal ones: CI
// on pull requests runs most suites without GC stress and main runs them
// all with it (#372).
const gcStressDisabled = globalThis.process?.env?.NONA_GC_STRESS === "off";

/**
 * `callStats` counts every call by target and prints the counts when the
 * program ends (see call-stats.ts); otherwise this is generateImage.
 */
export function generate(
    module: ModuleIR,
    options: {
        gcStress?: boolean;
        unhandledRejections?: "throw" | "ignore";
        realms?: number;
        agent?: boolean;
        agentPrograms?: NativeProgram[];
        link?: RuntimeLink;
        baseCache?: BaseImageCache;
        callStats?: boolean;
        coverage?: CoverageOptions;
        listing?: boolean;
    } = {},
): NativeProgram {
    if (options.gcStress && gcStressDisabled)
        options = { ...options, gcStress: false };
    if (!options.callStats && !options.coverage)
        return generateImage(module, options);
    if (!options.callStats)
        return addCoverage(
            module,
            generateImage(module, options),
            options.coverage!,
        );
    const counted = new Set<string>();
    setCallCounter((target) => {
        if (target === "rt.callStatsReport") return undefined;
        counted.add(target);
        return "stats." + target;
    });
    let program: NativeProgram;
    try {
        program = generateImage(module, options);
    } finally {
        setCallCounter(undefined);
    }
    // A counter and a name record per target, and the table that lists them.
    const targets = [...counted].sort(),
        table = new Uint8Array(8 + 16 * targets.length),
        fixups: NamedFragment["fixups"] = [];
    new DataView(table.buffer).setBigUint64(0, BigInt(targets.length), true);
    targets.forEach((target, index) => {
        const name = new TextEncoder().encode(target),
            record = new Uint8Array(8 + name.length);
        new DataView(record.buffer).setBigUint64(0, BigInt(name.length), true);
        record.set(name, 8);
        program.fragments.push({
            name: "stats." + target,
            section: ".data",
            alignment: 8,
            bytes: new Uint8Array(8),
            fixups: [],
            symbols: {},
        });
        program.fragments.push({
            name: "stats.name." + index,
            section: ".rdata",
            alignment: 8,
            bytes: record,
            fixups: [],
            symbols: {},
        });
        fixups.push(
            {
                offset: 8 + 16 * index,
                kind: "va64",
                target: "stats.name." + index,
                addend: 0,
            },
            {
                offset: 16 + 16 * index,
                kind: "va64",
                target: "stats." + target,
                addend: 0,
            },
        );
    });
    const fragment = program.fragments.find(
        (f) => f.name === "rt.callStatsTable",
    )!;
    fragment.bytes = table;
    fragment.fixups = fixups;
    return options.coverage
        ? addCoverage(module, program, options.coverage)
        : program;
}
/** `link` selects the optional runtime parts (all by default). */
function generateImage(
    module: ModuleIR,
    options: {
        gcStress?: boolean;
        unhandledRejections?: "throw" | "ignore";
        realms?: number;
        agent?: boolean;
        agentPrograms?: NativeProgram[];
        link?: RuntimeLink;
        baseCache?: BaseImageCache;
        callStats?: boolean;
        coverage?: CoverageOptions;
        listing?: boolean;
    } = {},
): NativeProgram {
    const userGlobalCount = module.globalCount;
    const rejectionPolicy = options.unhandledRejections ?? "throw";
    // Syntax helper parts follow the calls of the program's IR (#278), also
    // for callers that pass their own source usage as the link.
    const link = withSyntaxParts(options.link ?? fullRuntimeLink, module);
    const linked = linkedPreludes(link);
    const regexpLink = runtimeRegExpLink(link, linked);
    const hasPrelude = !!module.runtimePrelude;
    const realms = hasPrelude ? (options.realms ?? 0) : 0;
    const baseKey = JSON.stringify({
        target: currentNativeTarget(),
        prelude: hasPrelude,
        rejectionPolicy,
        gcStress: !!options.gcStress,
        realms,
        regexpLink,
        unicodeNormalization: link.unicodeNormalization,
        float16: link.float16,
        linked,
    });
    // A call-statistics build counts the runtime's calls too: it is generated afresh.
    let base = options.callStats ? undefined : baseImages.get(baseKey);
    if (!base && options.baseCache && !options.callStats) {
        base = options.baseCache.get(baseKey);
        if (base) {
            reserveAssemblerSerial(base.serial);
            baseImages.set(baseKey, base);
        }
    }
    // The prelude is lowered only when its code has to be generated.
    const lowerPrelude = (): ModuleIR => {
        const prelude = lowerRuntimePrelude(
            rejectionPolicy,
            regexpLink,
            linked,
        );
        if (prelude.globalCount !== 2)
            throw new Error("Runtime prelude must have two global bindings");
        return prelude;
    };
    const prefix = (id: string) => id.replace(/^js\./, "js.regexpVm.");
    const preludeFunctions = () =>
        (hasPrelude ? lowerPrelude().functions : []).map((fn) => ({
            ...fn,
            id: prefix(fn.id),
            blocks: fn.blocks.map((block) => ({
                ...block,
                operations: block.operations.map((op) => {
                    if (op.kind === "newFunction") {
                        // Prelude functions are built-ins: they print as native code, so
                        // their source text is not embedded in the executable.
                        const { sourceText, sourceRange, ...rest } = op;
                        (void sourceText, sourceRange);
                        return { ...rest, target: prefix(op.target) };
                    }
                    if (op.kind === "invoke" && op.direct)
                        return { ...op, direct: prefix(op.direct) };
                    if (op.kind === "loadGlobal" || op.kind === "storeGlobal")
                        return { ...op, prelude: true };
                    return op;
                }),
            })),
        }));
    const realmCodeTables = new Set<string>();
    let fragments: NamedFragment[],
        functions: UnwindFunction[],
        imports: NativeProgram["imports"],
        literals: Map<string, string>;
    const copyFragments = (list: NamedFragment[]) =>
        list.map((f) => ({
            ...f,
            bytes: f.bytes.slice(),
            fixups: f.fixups.map((fixup) => ({ ...fixup })),
            symbols: { ...f.symbols },
        }));
    if (base) {
        fragments = copyFragments(base.fragments);
        functions = base.functions.map((fn) => ({ ...fn }));
        imports = [...base.imports];
        literals = new Map(base.literals);
    } else {
        const runtime = emitRuntime({
            operations: new Set(),
            realms,
            unicodeNormalization: link.unicodeNormalization,
            float16: link.float16,
        });
        fragments = [...runtime.fragments];
        functions = [...runtime.functions];
        imports = [...runtime.imports];
        literals = new Map();
        // Program literals equal to a runtime string record use that record:
        // property keys then match by identity (`x.length`, global names).
        for (const fragment of runtime.fragments)
            if (
                fragment.stringText !== undefined &&
                !literals.has(fragment.stringText)
            )
                literals.set(fragment.stringText, fragment.name);
        if (hasPrelude)
            fragments
                .find((f) => f.name === "rt.regexpVmCell")!
                .fixups.push({
                    offset: 0,
                    kind: "va64",
                    target: "rt.preludeGlobals",
                    addend: 0,
                });
    }
    const runtime = { imports };
    // A constant Value in .rdata: {tag, payload}, one per distinct constant.
    // Recorded in the literal table (under a key no string literal has), which
    // a cached base image carries, so programs reuse the base's constants.
    const constantValue = (v: unknown): string => {
        const key =
            "\u0000constant:" +
            typeof v +
            ":" +
            (typeof v === "number"
                ? Object.is(v, -0)
                    ? "-0"
                    : String(v)
                : String(v));
        const existing = literals.get(key);
        if (existing) return existing;
        const tag =
            v === undefined
                ? 0
                : v === null
                  ? 1
                  : typeof v === "boolean"
                    ? 2
                    : typeof v === "number"
                      ? 3
                      : typeof v === "bigint"
                        ? 7
                        : 4;
        const name = "constant." + literals.size,
            bytes = new Uint8Array(16),
            view = new DataView(bytes.buffer),
            fixups: NamedFragment["fixups"] = [];
        view.setBigUint64(0, BigInt(tag), true);
        if (typeof v === "string" || typeof v === "bigint")
            fixups.push({
                offset: 8,
                kind: "va64",
                target: literal(String(v)),
                addend: 0,
            });
        else if (typeof v === "number") view.setFloat64(8, v, true);
        else if (v === true) view.setBigUint64(8, 1n, true);
        literals.set(key, name);
        fragments.push({
            name,
            section: ".rdata",
            alignment: 8,
            bytes,
            fixups,
            symbols: {},
        });
        return name;
    };
    const literal = (value: string): string => {
        const existing = literals.get(value);
        if (existing) return existing;
        const name = "literal." + literals.size,
            bytes = new Uint8Array(8 + value.length * 2),
            v = new DataView(bytes.buffer);
        v.setBigUint64(0, BigInt(value.length), true);
        for (let i = 0; i < value.length; i++)
            v.setUint16(8 + 2 * i, value.charCodeAt(i), true);
        literals.set(value, name);
        fragments.push({
            name,
            section: ".rdata",
            alignment: 8,
            bytes,
            fixups: [],
            symbols: {},
        });
        return name;
    };
    // Each module's text is emitted once (one byte per character when it
    // fits); a function's source is a static descriptor {text, start, length}
    // that rt.sourceSlice turns into a string (Function.prototype.toString).
    const sources = new Map<string, string>();
    const sourceRange = (range: {
        source: string;
        start: number;
        end: number;
    }): string => {
        let text = sources.get(range.source);
        if (!text) {
            const source = range.source,
                wide = /[^\u0000-\u00ff]/.test(source),
                bytes = new Uint8Array(16 + source.length * (wide ? 2 : 1)),
                view = new DataView(bytes.buffer);
            view.setBigUint64(0, BigInt(source.length), true);
            view.setBigUint64(8, wide ? 1n : 0n, true);
            if (wide)
                for (let i = 0; i < source.length; i++)
                    view.setUint16(16 + 2 * i, source.charCodeAt(i), true);
            else
                for (let i = 0; i < source.length; i++)
                    bytes[16 + i] = source.charCodeAt(i);
            text = "source." + fragments.length;
            sources.set(source, text);
            fragments.push({
                name: text,
                section: ".rdata",
                alignment: 8,
                bytes,
                fixups: [],
                symbols: {},
            });
        }
        const name = "sourceRange." + fragments.length,
            bytes = new Uint8Array(24),
            view = new DataView(bytes.buffer);
        view.setBigUint64(8, BigInt(range.start), true);
        view.setBigUint64(16, BigInt(range.end - range.start), true);
        fragments.push({
            name,
            section: ".rdata",
            alignment: 8,
            bytes,
            fixups: [{ offset: 0, kind: "va64", target: text, addend: 0 }],
            symbols: {},
        });
        return name;
    };
    const globalProperties = module.globalProperties ?? [];
    if (!base) {
        preludeFunctions().forEach((fn) => emitFunction(fn));
        const image: BaseImage = {
            fragments: copyFragments(fragments),
            functions: functions.map((fn) => ({ ...fn })),
            imports: [...imports],
            literals: new Map(literals),
            serial: assemblerSerial(),
        };
        if (!options.callStats) {
            baseImages.set(baseKey, image);
            options.baseCache?.set(baseKey, image);
        }
    }
    fragments.push({
        name: "js.globals",
        section: ".data",
        alignment: 16,
        bytes: new Uint8Array(Math.max(16, module.globalCount * 16)),
        fixups: [],
        symbols: {},
    });
    const aliasBytes = new Uint8Array(
        Math.max(24, globalProperties.length * 24),
    );
    for (let i = 0; i < globalProperties.length; i++)
        aliasBytes[i * 24 + 16] = 3;
    fragments.push({
        name: "js.globalBindings",
        section: ".data",
        alignment: 8,
        bytes: aliasBytes,
        symbols: {},
        fixups: globalProperties.flatMap((property, i) => [
            {
                offset: i * 24,
                kind: "va64" as const,
                target: literal(property.name),
                addend: 0,
            },
            {
                offset: i * 24 + 8,
                kind: "va64" as const,
                target: "js.globals",
                addend: property.index * 16,
            },
        ]),
    });
    function finish(
        a: Assembler,
        name: string,
        size: number,
        prologSize: number,
        allocationCodeOffset = prologSize,
        savedRegisters: UnwindFunction["savedRegisters"] = [],
    ): void {
        a.label(name + ".end");
        fragments.push({ ...a.finish(), name, section: ".text" });
        functions.push({
            begin: name,
            end: name + ".end",
            prologSize,
            allocationCodeOffset,
            stackAllocation: size,
            savedRegisters,
        });
    }
    function emitFunction(fn: FunctionIR): void {
        emitFunctionCode(
            {
                fragments,
                literal,
                constantValue,
                sourceRange,
                finish,
                options,
                globalProperties,
                realmCodeTables,
            },
            fn,
        );
    }
    // --print-asm lists the program's own functions only (not the runtime or preludes).
    let assembly: string | undefined;
    if (options.listing) {
        setAssemblyListing(true);
        try {
            module.functions.forEach((fn) => emitFunction(fn));
        } finally {
            setAssemblyListing(false);
        }
        const byName = new Map(fragments.map((f) => [f.name, f]));
        assembly = module.functions
            .map((fn) => {
                const f = byName.get(fn.id)!;
                return renderListing(fn.id, f.bytes, f.listing ?? []);
            })
            .join("\n");
    } else module.functions.forEach((fn) => emitFunction(fn));
    // Per-realm addresses of the code and intrinsics realmFunction uses.
    for (const symbol of realmCodeTables)
        fragments.push({
            name: "realm.code." + symbol,
            section: ".rdata",
            alignment: 8,
            bytes: new Uint8Array(8 * (realms + 1)),
            symbols: {},
            fixups: Array.from({ length: realms + 1 }, (_, realm) => ({
                offset: 8 * realm,
                kind: "va64" as const,
                target: realm === 0 ? symbol : realmSymbol(realm, symbol),
                addend: 0,
            })),
        });
    // Host functions installed as properties of the global object before the prelude.
    const hostGlobals: string[] = [];
    const hostGlobal = (name: string, code: string, length: number): void => {
        const base = "host." + name;
        fragments.push(
            stringLiteral(base + ".key", name),
            stringLiteral(
                base + ".source",
                `function ${name}() { [native code] }`,
            ),
        );
        const callable = new Uint8Array(FunctionLayout.size);
        callable[O.kind] = FunctionKind;
        callable[FunctionLayout.rawThis] = 1;
        const lengthProperty = new Uint8Array(P.size);
        lengthProperty[P.value] = 3;
        lengthProperty[P.attributes] = A.configurable;
        new DataView(lengthProperty.buffer).setFloat64(
            P.value + 8,
            length,
            true,
        );
        fragments.push({
            name: base + ".length",
            section: ".data",
            alignment: 8,
            bytes: lengthProperty,
            symbols: {},
            fixups: [
                {
                    offset: P.key,
                    kind: "va64",
                    target: "rt.str.length",
                    addend: 0,
                },
            ],
        });
        const nameProperty = new Uint8Array(P.size);
        nameProperty[P.value] = 4;
        nameProperty[P.attributes] = A.configurable;
        fragments.push({
            name: base + ".name",
            section: ".data",
            alignment: 8,
            bytes: nameProperty,
            symbols: {},
            fixups: [
                {
                    offset: P.next,
                    kind: "va64",
                    target: base + ".length",
                    addend: 0,
                },
                {
                    offset: P.key,
                    kind: "va64",
                    target: "rt.str.name",
                    addend: 0,
                },
                {
                    offset: P.value + 8,
                    kind: "va64",
                    target: base + ".key",
                    addend: 0,
                },
            ],
        });
        fragments.push({
            name: base + ".fn",
            section: ".data",
            alignment: 8,
            bytes: callable,
            symbols: {},
            fixups: [
                {
                    offset: O.properties,
                    kind: "va64",
                    target: base + ".name",
                    addend: 0,
                },
                {
                    offset: O.prototype,
                    kind: "va64",
                    target: "rt.functionPrototype",
                    addend: 0,
                },
                {
                    offset: FunctionLayout.code,
                    kind: "va64",
                    target: code,
                    addend: 0,
                },
                {
                    offset: FunctionLayout.sourceText,
                    kind: "va64",
                    target: base + ".source",
                    addend: 0,
                },
            ],
        });
        const keyValue = new Uint8Array(16);
        keyValue[0] = 4;
        const fnValue = new Uint8Array(16);
        fnValue[0] = 5;
        fragments.push({
            name: base + ".keyValue",
            section: ".rdata",
            alignment: 8,
            bytes: keyValue,
            symbols: {},
            fixups: [
                { offset: 8, kind: "va64", target: base + ".key", addend: 0 },
            ],
        });
        fragments.push({
            name: base + ".fnValue",
            section: ".rdata",
            alignment: 8,
            bytes: fnValue,
            symbols: {},
            fixups: [
                { offset: 8, kind: "va64", target: base + ".fn", addend: 0 },
            ],
        });
        hostGlobals.push(base);
    };
    // Windows APIs and the selected POSIX syscalls share the prelude boundary.
    // On x64, Windows/Linux declarations retain dual PE/ELF linking. Private
    // memory/vector helpers bind directly to original code in the image.
    const hostFfi =
        hasPrelude && linked.includes("process")
            ? processHostDeclarations(currentNativeTarget() ?? "win32-x64")
            : [];
    if (module.ffi?.length || hostFfi.length) {
        const ffi = emitFfi(module.ffi ?? []).bundle;
        fragments.push(...ffi.fragments);
        functions.push(...ffi.functions);
        runtime.imports.push(...ffi.imports);
        if (module.ffi?.length)
            hostGlobal("__nonaFfiLastError", "rt.ffiLastError.code", 0);
        const host = emitFfi(
            hostFfi.map((h) => h.declaration),
            { prefix: "hostffi", support: false },
        ).bundle;
        const internal = hostFfi.filter(
            (h) => h.declaration.dll === "nona.internal",
        );
        const internalSymbols = new Set(
            internal.map(
                (h) => "hostffi" + ffiImportSymbol(h.declaration).slice(3),
            ),
        );
        const externalFragment = (name: string) =>
            !internalSymbols.has(
                name.replace(/^linux\./, "").replace(/\.code$/, ""),
            );
        fragments.push(
            ...host.fragments.filter((f) => externalFragment(f.name)),
        );
        functions.push(
            ...host.functions.filter((f) => externalFragment(f.begin)),
        );
        runtime.imports.push(
            ...host.imports.filter((i) => !internalSymbols.has(i.symbol)),
        );
        if (internal.length) {
            const helpers = processNativeHelpers().bundle;
            fragments.push(...helpers.fragments);
            functions.push(...helpers.functions);
            for (const imported of helpers.imports)
                if (
                    !runtime.imports.some(
                        (existing) =>
                            existing.symbol === imported.symbol &&
                            existing.dll === imported.dll &&
                            existing.name === imported.name,
                    )
                )
                    runtime.imports.push(imported);
            for (const h of internal)
                fragments.push({
                    name: "hostffi" + ffiImportSymbol(h.declaration).slice(3),
                    section: ".rdata",
                    alignment: 8,
                    bytes: new Uint8Array(8),
                    symbols: {},
                    fixups: [
                        {
                            offset: 0,
                            kind: "va64",
                            target: "process." + h.declaration.name + ".code",
                            addend: 0,
                        },
                    ],
                });
            hostGlobal("__nonaProcessNow", "rt.hostNow.code", 0);
            hostGlobal(
                "__nonaProcessFinalization",
                "process.finalization.code",
                3,
            );
            hostGlobal("__nonaProcessUnits", "process.units.code", 2);
        }
        hostFfi.forEach((h, index) =>
            hostGlobal("__nonaHost_" + h.name, "hostffi." + index + ".code", 0),
        );
    }
    if (hasPrelude && linked.includes("timers")) {
        // Event-loop primitives, captured and removed from the global object by the timer prelude.
        hostGlobal("__nonaHostNow", "rt.hostNow.code", 0);
        hostGlobal("__nonaHostWait", "rt.agentSleep.code", 1);
    }
    if (hasPrelude && linked.includes("encoding")) {
        // UTF-8 transcoding, captured and removed from the global object by the encoding prelude.
        hostGlobal("__nonaUtf8Encode", "rt.utf8Encode.code", 2);
        hostGlobal("__nonaUtf8Decode", "rt.utf8Decode.code", 3);
    }
    if (hasPrelude && linked.includes("buffer")) {
        hostGlobal("__nonaHexEncode", "rt.hexEncode.code", 1);
        hostGlobal("__nonaByteCopy", "rt.byteCopy.code", 3);
    }
    const finalizationRegistry = linked.includes("finalizationRegistry");
    if (hasPrelude && (linked.includes("weakRef") || finalizationRegistry)) {
        // Captured and removed from the global object by the WeakRef or the
        // FinalizationRegistry prelude, whichever runs first.
        const helpers = weakRefNativeHelpers().bundle;
        fragments.push(...helpers.fragments);
        functions.push(...helpers.functions);
        hostGlobal("__nonaWeakRefTarget", "rt.weakRefTarget.code", 1);
    }
    if (hasPrelude && finalizationRegistry) {
        // Captured and removed by the FinalizationRegistry prelude.
        const helpers = gcCountNativeHelper().bundle;
        fragments.push(...helpers.fragments);
        functions.push(...helpers.functions);
        hostGlobal("__nonaGcCount", "rt.gcCountValue.code", 0);
    }
    if (hasPrelude && regexpLink.regexp)
        // First-unit scan of the RegExp engine (#258), captured and removed by the prelude.
        hostGlobal("__nonaRegexpScan", "rt.regexpScan.code", 3);
    if (hasPrelude && linked.includes("network")) {
        // Captured and removed from the global object by nona:internal/native.
        hostGlobal("__nonaNetParse", "rt.netParse.code", 4);
        hostGlobal("__nonaNetLatin1", "rt.netLatin1.code", 3);
        hostGlobal("__nonaNetWrite", "rt.netWrite.code", 4);
        hostGlobal("__nonaNetCopy", "rt.netCopy.code", 5);
        hostGlobal("__nonaNetCheck", "rt.netCheck.code", 2);
        // JSON.stringify into UTF-8 bytes (#155), for node:http and nona:json.
        hostGlobal("__nonaJsonStringifyBytes", "rt.jsonStringifyBytes.code", 3);
    }
    const agentPrograms = options.agentPrograms ?? [];
    if (options.agent) {
        hostGlobal(
            "__nonaAgentReceiveBroadcast",
            "rt.agentReceiveBroadcast.code",
            1,
        );
        hostGlobal("__nonaAgentReport", "rt.agentReport.code", 1);
        hostGlobal("__nonaAgentSleep", "rt.agentSleep.code", 1);
    }
    if (agentPrograms.length) {
        hostGlobal("__nonaAgentStart", "rt.agentStart.code", 1);
        hostGlobal("__nonaAgentBroadcast", "rt.agentBroadcast.code", 2);
        hostGlobal("__nonaAgentGetReport", "rt.agentGetReport.code", 0);
        hostGlobal("__nonaAgentSleep", "rt.agentSleep.code", 1);
    }
    if (realms > 0) {
        // realm.createRealm(): initialize the next cloned realm and return its global.
        hostGlobal("__nonaCreateRealm", "realm.createRealm.code", 0);
        fragments.push({
            name: "realm.count",
            section: ".data",
            alignment: 8,
            bytes: new Uint8Array(8),
            fixups: [],
            symbols: {},
        });
        const a = createAssembler("realm.createRealm.code"),
            size = 88;
        a.sub("rsp", size);
        const prolog = a.offset;
        a.store(stack(72), "rcx");
        a.load("rax", { rip: "realm.count" });
        a.add("rax", 1);
        a.cmp("rax", realms);
        failIf(a, "a", "rt.throwRangeError");
        a.store({ rip: "realm.count" }, "rax");
        const done = a.unique("done");
        for (let realm = 1; realm <= realms; realm++) {
            const next = a.unique("next");
            a.load("rax", { rip: "realm.count" });
            a.cmp("rax", realm);
            a.jcc("ne", next);
            const r = (name: string) => realmSymbol(realm, name);
            a.lea("rax", { rip: r("js.globals") });
            a.store({ rip: r("rt.gcGlobals") }, "rax");
            a.mov("rax", module.globalCount);
            a.store({ rip: r("rt.gcGlobalCount") }, "rax");
            a.lea("rax", { rip: r("js.globalBindings") });
            a.store({ rip: r("rt.globalBindings") }, "rax");
            a.mov("rax", 0);
            a.store({ rip: r("rt.globalBindingCount") }, "rax");
            a.mov("rax", 1);
            a.store({ rip: r("rt.realmReady") }, "rax");
            a.lea("rax", { rip: r("rt.globalValue") });
            a.store(stack(32), "rax");
            a.lea("rax", { rip: "rt.undefinedValue" });
            a.store(stack(40), "rax");
            a.lea("rcx", stack(48));
            a.mov("rdx", 0);
            a.lea("r8", stack(48));
            a.mov("r9", 0);
            a.call(r("js.regexpVm.main"));
            a.load("rcx", stack(72));
            for (const offset of [0, 8]) {
                a.load("rax", { rip: r("rt.globalValue"), addend: offset });
                a.store({ base: "rcx", disp: offset }, "rax");
            }
            a.jmp(done);
            a.label(next);
        }
        a.label(done);
        a.add("rsp", size);
        a.ret();
        finish(a, "realm.createRealm.code", size, prolog);
        cloneRealms(
            fragments,
            functions,
            realms,
            FunctionLayout.size,
            FunctionLayout.realm,
        );
    }
    // Thread entries of the linked agent programs.
    const countFragment = fragments.find((f) => f.name === "agent.entryCount")!,
        entriesFragment = fragments.find((f) => f.name === "agent.entries")!;
    new DataView(countFragment.bytes.buffer).setBigUint64(
        0,
        BigInt(agentPrograms.length),
        true,
    );
    entriesFragment.bytes = new Uint8Array(
        Math.max(8, 8 * agentPrograms.length),
    );
    entriesFragment.fixups = agentPrograms.map((_, agent) => ({
        offset: 8 * agent,
        kind: "va64" as const,
        target: agentSymbol(agent, "entry"),
        addend: 0,
    }));
    mergeAgentPrograms(fragments, functions, runtime.imports, agentPrograms);
    const entry = createAssembler("entry");
    if (!options.agent) entry.initializeStack();
    if (!options.agent && hostFfi.length)
        captureProcessStartup(entry, currentNativeTarget() ?? "win32-x64");
    const processBoundary = hasPrelude && linked.includes("process"),
        entryFrame = processBoundary ? 424 : 72;
    if (processBoundary) {
        const bytes = new Uint8Array(16);
        bytes[0] = 4;
        fragments.push({
            name: "process.dispatchKey",
            section: ".rdata",
            alignment: 8,
            bytes,
            symbols: {},
            fixups: [
                {
                    offset: 8,
                    kind: "va64",
                    target: literal("dispatchUncaught"),
                    addend: 0,
                },
            ],
        });
    }
    entry.sub("rsp", entryFrame);
    const p = entry.offset;
    entry.lea("rax", { base: "rsp", disp: -StackBudget.main });
    entry.store({ rip: "rt.stackLimit" }, "rax");
    entry.call("rt.init");
    if (!options.agent) entry.call("rt.processSignalDefaults");
    // GC stress: freed cells are poisoned so a missing root fails at once.
    if (options.gcStress) {
        entry.mov("rax", 1);
        entry.store({ rip: "rt.gcPoison" }, "rax");
    }
    entry.lea("rax", { rip: "js.globals" });
    entry.store({ rip: "rt.gcGlobals" }, "rax");
    entry.mov("rax", module.globalCount);
    entry.store({ rip: "rt.gcGlobalCount" }, "rax");
    entry.lea("rax", { rip: "js.globalBindings" });
    entry.store({ rip: "rt.globalBindings" }, "rax");
    // Preludes install built-ins before script declaration aliases become visible.
    entry.mov("rax", 0);
    entry.store({ rip: "rt.globalBindingCount" }, "rax");
    for (const base of hostGlobals) {
        entry.lea("rcx", { rip: "rt.globalValue" });
        entry.lea("rdx", { rip: base + ".keyValue" });
        entry.lea("r8", { rip: base + ".fnValue" });
        entry.mov("r9", A.writable | A.configurable);
        entry.call("rt.setProperty");
    }
    const callArguments = () => {
        entry.lea("rax", { rip: "rt.globalValue" });
        entry.store(stack(32), "rax");
        entry.lea("rax", { rip: "rt.undefinedValue" });
        entry.store(stack(40), "rax");
        entry.lea("rcx", stack(48));
        entry.mov("rdx", 0);
        entry.lea("r8", stack(48));
        entry.mov("r9", 0);
    };
    const drain = () => {
        entry.lea("rcx", stack(48));
        entry.lea("rdx", { rip: "rt.preludeGlobals" });
        entry.add("rdx", 16);
        entry.mov("r8", 0);
        entry.lea("r9", stack(48));
        entry.call("rt.invoke");
    };
    callArguments();
    if (hasPrelude) {
        entry.call("js.regexpVm.main");
        callArguments();
    }
    entry.mov("rax", globalProperties.length);
    entry.store({ rip: "rt.globalBindingCount" }, "rax");
    // The outer boundary catches JS throws only, after rt.throw restores the
    // stack, precise roots and cleanup chain. Runtime failures remain rt.fail.
    const uncaught = entry.unique("uncaught"),
        drainStart = entry.unique("drainStart"),
        drained = entry.unique("drained");
    const pushEntryHandler = () => {
        entry.load("rax", { rip: "rt.exceptionHandler" });
        entry.store(stack(96 + H.next), "rax");
        entry.mov("rax", "rsp");
        entry.store(stack(96 + H.stack), "rax");
        entry.lea("rax", { rip: uncaught });
        entry.store(stack(96 + H.target), "rax");
        entry.load("rax", { rip: "rt.gcRoots" });
        entry.store(stack(96 + H.roots), "rax");
        entry.lea("rax", stack(80));
        entry.store(stack(96 + H.value), "rax");
        entry.load("rax", { rip: "rt.cleanupHead" });
        entry.store(stack(96 + H.cleanup), "rax");
        preservedGp.forEach((reg, i) =>
            entry.store(stack(96 + H.gp + 8 * i), reg),
        );
        preservedXmm.forEach((reg, i) =>
            entry.storeXmm128(stack(96 + H.xmm + 16 * i), reg),
        );
        entry.mov("rax", 0);
        entry.store(stack(96 + H.kind), "rax");
        entry.lea("rax", stack(96));
        entry.store({ rip: "rt.exceptionHandler" }, "rax");
    };
    const popEntryHandler = () => {
        entry.load("rax", stack(96 + H.next));
        entry.store({ rip: "rt.exceptionHandler" }, "rax");
    };
    if (processBoundary) {
        entry.mov("rax", 0);
        for (const offset of [64, 72, 80, 88])
            entry.store(stack(offset), "rax");
        entry.load("rax", { rip: "rt.gcRoots" });
        entry.store(stack(384 + R.next), "rax");
        entry.lea("rax", stack(64));
        entry.store(stack(384 + R.values), "rax");
        entry.mov("rax", 2);
        entry.store(stack(384 + R.count), "rax");
        entry.lea("rax", stack(384));
        entry.store({ rip: "rt.gcRoots" }, "rax");
        pushEntryHandler();
    }
    entry.call("js.main");
    if (processBoundary) popEntryHandler();
    entry.label(drainStart);
    if (processBoundary) pushEntryHandler();
    if (hasPrelude) drain();
    if (processBoundary) {
        popEntryHandler();
        entry.jmp(drained);
        entry.label(uncaught);
        entry.lea("rcx", stack(64));
        entry.lea("rdx", { rip: "rt.preludeGlobals" });
        entry.lea("r8", { rip: "process.dispatchKey" });
        entry.call("rt.getProperty");
        entry.load("rax", stack(64));
        entry.cmp("rax", 5);
        failIf(entry, "ne");
        entry.lea("rax", { rip: "rt.undefinedValue" });
        entry.store(stack(32), "rax");
        entry.store(stack(40), "rax");
        entry.lea("rcx", stack(48));
        entry.lea("rdx", stack(64));
        entry.mov("r8", 1);
        entry.lea("r9", stack(80));
        entry.call("rt.invoke");
        entry.mov("rax", 0);
        for (const offset of [64, 72, 80, 88])
            entry.store(stack(offset), "rax");
        entry.jmp(drainStart);
        entry.label(drained);
        entry.load("rax", stack(384 + R.next));
        entry.store({ rip: "rt.gcRoots" }, "rax");
    }
    if (options.agent) {
        // An agent thread handles one broadcast, runs its jobs and returns.
        entry.call("rt.agentAwaitBroadcast");
        if (hasPrelude) drain();
        entry.mov("rax", 0);
        entry.add("rsp", entryFrame);
        entry.ret();
        finish(entry, "entry", entryFrame, p);
    } else {
        if (options.callStats) entry.call("rt.callStatsReport");
        entry.call("rt.runExitHook");
        entry.call("rt.dispose");
        entry.mov("rcx", 0);
        entry.callImport("ExitProcess");
        entry.add("rsp", entryFrame);
        entry.ret();
        finish(entry, "entry", entryFrame, p);
    }
    return {
        fragments,
        imports: runtime.imports,
        entry: "entry",
        functions,
        ...(assembly !== undefined ? { assembly } : {}),
    };
}
