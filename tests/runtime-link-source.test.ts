import { requireHostTarget } from "../src/target.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import {
    compile,
    compileToIR,
    hostTarget,
    type CompileOptions,
    type Target,
} from "../src/compiler.js";
import { collectSourceUsage, lex } from "../src/frontend/lexer.js";
import { parse } from "../src/frontend/parser.js";
import {
    preludeSet,
    requiredSyntaxParts,
    syntaxOnlyPreludes,
} from "../src/link.js";
import { fullRegexpVmPrelude } from "../src/runtime/regexp-vm-source.js";
import { createContext, runInContext } from "node:vm";

function image(
    source: string,
    options: Partial<CompileOptions> = {},
    target: Target = hostTarget ?? requireHostTarget(),
): Uint8Array {
    const result = compile(source, {
        fileName: options.module ? "/app.mjs" : "/app.js",
        target,
        ...options,
    });
    assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics));
    return result.image;
}

const usage = (...sources: string[]) =>
    collectSourceUsage(() => sources.forEach((source) => parse(lex(source))))
        .usage;

test("source usage: what reaches the RegExp engine and the Unicode tables", () => {
    const none = {
        regexp: false,
        unicodeProperties: false,
        unicodeSets: false,
        unicodeStringProperties: false,
        unicodeNormalization: false,
        float16: false,
        preludes: preludeSet(false),
    };
    assert.deepEqual(
        usage('console.log("hi".split(",").join("-"), "a".replace("a", "b"))'),
        none,
    );
    assert.deepEqual(usage("/a+/g.test(s)"), { ...none, regexp: true });
    assert.deepEqual(usage("/\\p{L}/u.test(s)"), {
        ...none,
        regexp: true,
        unicodeProperties: true,
    });
    // Non-ASCII or escaped group names are checked against ID_Start/ID_Continue.
    for (const source of [
        "/(?<𝒜>b)/u",
        "/(?<\\u{72f8}>x)/u",
        "/(?<\\u0061>x)/",
        "/\\k<ñ>(?<ñ>x)/",
    ])
        assert.deepEqual(
            usage(source),
            { ...none, regexp: true, unicodeProperties: true },
            source,
        );
    for (const source of ["/(?<year>\\d+)\\k<year>/", "/(?<=é)x/", "/(?<!é)x/"])
        assert.deepEqual(usage(source), { ...none, regexp: true }, source);
    for (const source of [
        "new RegExp(p)",
        "s.match(p)",
        "s.matchAll(p)",
        "s.search(p)",
        'self["RegExp"]',
        "s[`match`](p)",
        "\\u0052egExp(p)",
    ])
        assert.deepEqual(
            usage(source),
            { ...none, regexp: true, unicodeProperties: true },
            source,
        );
    for (const source of ["s.normalize()", 's["normalize"]()'])
        assert.deepEqual(
            usage(source),
            { ...none, unicodeNormalization: true },
            source,
        );
    // localeCompare and Intl reach the collator of the Intl prelude.
    for (const source of ["a.localeCompare(b)", "new Intl.Collator()"])
        assert.deepEqual(
            usage(source),
            {
                ...none,
                unicodeNormalization: true,
                preludes: { ...none.preludes, intl: true },
            },
            source,
        );
    for (const source of [
        "Math.f16round(x)",
        "view.getFloat16(0)",
        "view.setFloat16(0, 1)",
        'Math["f16round"]',
    ])
        assert.deepEqual(usage(source), { ...none, float16: true }, source);
    // Float16Array also needs the %TypedArray% methods of binaryData.
    assert.deepEqual(usage("new Float16Array(4)"), {
        ...none,
        float16: true,
        preludes: { ...none.preludes, binaryData: true },
    });
    assert.equal(usage("Object.getOwnPropertyNames(Math)").float16, true);
    assert.equal(usage("Math.fround(x)").float16, false);
    // Float16Array is a global: enumerating the global object observes it.
    assert.equal(usage("Object.getOwnPropertyNames(globalThis)").float16, true);
    assert.equal(usage("globalThis['Float16' + 'Array']").float16, false);
    assert.equal(usage("new Float32Array(4).sort()").float16, false);
    // Every source parsed inside one collection counts; nested collections report to the outer one.
    const outer = collectSourceUsage(() => {
        parse(lex("1"));
        collectSourceUsage(() => parse(lex("/x/")));
    });
    assert.equal(outer.usage.regexp, true);
});

test("a program without regular expressions is several megabytes smaller", () => {
    for (const target of ["win32-x64", "linux-x64"] as const) {
        const trimmed = image('console.log("hi");', {}, target).length,
            full = image(
                'console.log("hi");',
                { fullRuntime: true },
                target,
            ).length;
        assert.ok(
            full - trimmed > 3_000_000,
            `${target}: ${trimmed} vs ${full} bytes`,
        );
        // A literal without \p links the engine but not the property tables.
        const engine = image('console.log(/a/.test("a"));', {}, target).length;
        assert.ok(
            engine > trimmed && engine < full - 1_000_000,
            `${target}: ${engine}`,
        );
    }
});

test("the emoji data of \\p{RGI_Emoji} is linked only when a source names a property of strings", () => {
    const none = {
        regexp: false,
        unicodeProperties: false,
        unicodeSets: false,
        unicodeStringProperties: false,
        unicodeNormalization: false,
        float16: false,
        preludes: preludeSet(false),
    };
    assert.deepEqual(usage('console.log("hi")'), none);
    assert.deepEqual(usage("/\\p{L}/u.test(s)"), {
        ...none,
        regexp: true,
        unicodeProperties: true,
    });
    for (const name of [
        "Basic_Emoji",
        "Emoji_Keycap_Sequence",
        "RGI_Emoji",
        "RGI_Emoji_ZWJ_Sequence",
    ])
        assert.deepEqual(
            usage(`/\\p{${name}}/v.test(s)`),
            {
                ...none,
                regexp: true,
                unicodeProperties: true,
                unicodeSets: true,
                unicodeStringProperties: true,
            },
            name,
        );
    // A pattern built at run time names the property in a string.
    assert.deepEqual(
        usage('new RegExp("[\\\\p{RGI_Emoji_Flag_Sequence}]", "v")'),
        {
            ...none,
            regexp: true,
            unicodeProperties: true,
            unicodeSets: true,
            unicodeStringProperties: true,
        },
    );
    for (const target of ["win32-x64", "linux-x64"] as const) {
        const size = (source: string) => image(source, {}, target).length;
        const hello = size('console.log("hi");'),
            named = size('console.log("RGI_Emoji");'),
            letters = size('console.log(/\\p{L}/u.test("a"));'),
            emoji = size('console.log(/\\p{RGI_Emoji}/v.test("a"));');
        // Without the RegExp engine the name alone links nothing.
        assert.ok(
            Math.abs(named - hello) < 1_000,
            `${target}: ${named} vs ${hello}`,
        );
        assert.ok(
            emoji - letters > 30_000,
            `${target}: ${emoji} vs ${letters}`,
        );
    }
    const linked = compile('console.log(/\\p{RGI_Emoji}/v.test("a"));', {
        fileName: "/app.js",
        target: "linux-x64",
        reportLink: true,
    });
    assert.ok(linked.ok);
    assert.deepEqual(
        linked.linked?.find((part) => part.part === "unicodeStringProperties"),
        {
            part: "unicodeStringProperties",
            reason: "a regular expression literal",
        },
    );
});

test("a property of strings named only at run time reports the missing emoji data", () => {
    const context = createContext({});
    runInContext(
        "Function.prototype.__nonaMarkNativeInternal=function(){}",
        context,
    );
    runInContext(
        fullRegexpVmPrelude({
            regexp: true,
            unicodeProperties: true,
            unicodeSets: true,
            unicodeStringProperties: false,
        }),
        context,
    );
    const compileVm = (pattern: string, flags: string) =>
        runInContext(
            `__nonaRegexpVm(undefined,"",0,false,${JSON.stringify(pattern)},${JSON.stringify(flags)})`,
            context,
        );
    assert.throws(
        () => compileVm("\\p{RGI_Emoji}", "v"),
        /compiled without the emoji data.*--full-runtime/,
    );
    // Syntax errors do not need the data; other properties still work.
    assert.throws(
        () => compileVm("\\P{RGI_Emoji}", "v"),
        /Invalid regular expression/,
    );
    assert.throws(
        () => compileVm("\\p{RGI_Emoji}", "u"),
        /Invalid regular expression/,
    );
    compileVm("\\p{Emoji}", "v");
});

test("the v flag syntax is linked only by a v flag literal or flags string", () => {
    const none = {
        regexp: false,
        unicodeProperties: false,
        unicodeSets: false,
        unicodeStringProperties: false,
        unicodeNormalization: false,
        float16: false,
        preludes: preludeSet(false),
    };
    assert.deepEqual(usage("/a/.test(s)"), { ...none, regexp: true });
    assert.deepEqual(usage("/[a--b]/v.test(s)"), {
        ...none,
        regexp: true,
        unicodeSets: true,
    });
    // A pattern built at run time may also use any Unicode property.
    assert.deepEqual(usage('new RegExp(p, "gv")'), {
        ...none,
        regexp: true,
        unicodeProperties: true,
        unicodeSets: true,
    });
    // Without the v-mode code the VM rejects the v flag and keeps the rest.
    const context = createContext({});
    runInContext(
        "Function.prototype.__nonaMarkNativeInternal=function(){}",
        context,
    );
    runInContext(
        fullRegexpVmPrelude({
            regexp: true,
            unicodeProperties: true,
            unicodeSets: false,
            unicodeStringProperties: false,
        }),
        context,
    );
    const exec = (pattern: string, flags: string, input: string) =>
        runInContext(
            `__nonaRegexpVm(undefined,${JSON.stringify(input)},0,false,${JSON.stringify(pattern)},${JSON.stringify(flags)})`,
            context,
        );
    assert.throws(
        () => exec("[a--b]", "v", "a"),
        /compiled without the v flag.*--full-runtime/,
    );
    exec("[\\p{L}b]", "u", "b");
    exec("[a-c]", "i", "B");
    assert.throws(
        () => exec("\\p{RGI_Emoji}", "u", "a"),
        /Invalid Unicode property/,
    );
    for (const target of ["win32-x64", "linux-x64"] as const) {
        const size = (source: string) => image(source, {}, target).length;
        const plain = size('console.log(/a/.test("a"));'),
            sets = size('console.log(/[a--b]/v.test("a"));');
        assert.ok(sets - plain > 20_000, `${target}: ${sets} vs ${plain}`);
    }
});

test("source usage: optional preludes follow the names a program uses", () => {
    const linked = (...sources: string[]) =>
        Object.entries(usage(...sources).preludes)
            .filter(([, on]) => on)
            .map(([name]) => name)
            .sort()
            .join(",");
    assert.equal(linked('console.log("hi")'), "");
    assert.equal(linked("new Proxy({}, {})"), "proxy");
    assert.equal(linked("Buffer.alloc(1)"), "buffer");
    assert.equal(linked('self["TextEncoder"]'), "encoding");
    assert.equal(linked("process.exitCode = 1"), "process");
    assert.equal(linked("new EventTarget()"), "events");
    assert.equal(linked('new AsyncResource("task")'), "asyncHooks");
    assert.equal(linked("setTimeout(f, 1)", "clearInterval(id)"), "timers");
    assert.equal(linked("a.at(-1)", 'Object.hasOwn(o, "x")'), "es2021");
    assert.equal(linked("Iterator.from(it).map(f)"), "iteratorHelpers");
    assert.equal(linked("gen().filter(f).toArray()"), "iteratorHelpers");
    assert.equal(linked("class X extends Iterator {}"), "iteratorHelpers");
    // The common method names alone do not select the iterator helpers.
    assert.equal(
        linked(
            "a.map(f).filter(g).reduce(h, 0)",
            "a.forEach(f); a.some(f); a.every(f); a.find(f)",
        ),
        "",
    );
    assert.equal(linked("s.isWellFormed()"), "wellFormed");
    assert.equal(linked("s.toWellFormed()"), "wellFormed");
    assert.equal(linked("new WeakRef(o).deref()"), "weakRef");
    assert.equal(linked("o.deref()"), "");
    assert.equal(
        linked("new FinalizationRegistry(f).register(o, 1)"),
        "finalizationRegistry",
    );
    assert.equal(linked("r.register(o, 1)", "r.unregister(t)"), "");
    assert.equal(linked("s.substr(1)"), "annexB");
    assert.equal(linked("n.toLocaleString()"), "intl");
    assert.equal(linked('s.anchor("x")', "d.toGMTString()"), "annexB");
    assert.equal(linked("performance.now()"), "timers");
    assert.equal(linked("Object.keys(globalThis)"), "timers");
    assert.equal(linked("new Uint8Array(4)"), "binaryData");
    assert.equal(linked("new DataView(buffer)"), "binaryData");
    assert.equal(linked("Atomics.add(a, 0, 1)"), "binaryData");
    assert.equal(linked('"abc".replaceAll("b", "c")'), "regexpProtocol");
    assert.equal(linked("RegExp.escape(s)"), "annexB,regexpEscape");
    assert.equal(linked("a.sort()"), "arraySort");
    assert.equal(linked("a.union(b)", "a.isDisjointFrom(b)"), "setMethods");
    assert.equal(linked("new Set([1]).has(1)"), "");
    assert.equal(linked("Object.freeze(o)"), "objectIntegrity");
    assert.equal(linked('o.__lookupGetter__("x")'), "objectAnnexB");
    // Strings are data (#438): they select only as property keys, or when
    // a source accesses properties with keys unknown at compile time.
    assert.equal(linked('const code = "x = setTimeout(g)"'), "");
    assert.equal(linked('const word = "data format"'), "");
    assert.equal(linked('const key = "at"'), "");
    assert.equal(linked('a["at"](-1)'), "es2021");
    assert.equal(linked('const key = "at"; a[key](-1)'), "es2021");
    assert.equal(linked('const key = "at"', "a[key](-1)"), "es2021");
    assert.equal(
        linked('const key = "at"; for (let i = 0; i < 2; i++) a[i]'),
        "",
    );
    // Enumerating built-ins could observe a missing method: everything is
    // linked, except preludes that add no built-ins (top-level await).
    const all = Object.keys(preludeSet(true))
        .filter((name) => !(syntaxOnlyPreludes as string[]).includes(name))
        .sort()
        .join(",");
    assert.equal(linked("Object.getOwnPropertyNames(Array.prototype)"), all);
    assert.equal(linked("Reflect.ownKeys(globalThis)"), all);
});

test("unrelated programs omit event and async-context preludes", () => {
    for (const source of [
        'console.log("hi")',
        "new Proxy({}, {})",
        "process.exitCode = 1",
        "setTimeout(f, 1)",
    ]) {
        const preludes = usage(source).preludes;
        assert.equal(preludes.events, false, source);
        assert.equal(preludes.asyncHooks, false, source);
    }
});

test("a program links only the preludes it names", () => {
    for (const target of ["win32-x64", "linux-x64"] as const) {
        const trimmed = image('console.log("hi");', {}, target).length;
        const all = image(
            "console.log(Reflect.ownKeys({}).length);",
            {},
            target,
        ).length;
        assert.ok(
            all - trimmed > 600_000,
            `${target}: ${trimmed} vs ${all} bytes`,
        );
    }
});

test("binary data methods and the RegExp protocol are linked only when reachable", () => {
    for (const target of ["win32-x64", "linux-x64"] as const) {
        const hello = image('console.log("hi");', {}, target).length;
        const binary = image(
            "console.log(new Uint8Array([2, 1]).sort().join());",
            {},
            target,
        ).length;
        const protocol = image(
            'console.log("a-b".replaceAll("-", "+"));',
            {},
            target,
        ).length;
        assert.ok(hello < 1_300_000, `${target}: ${hello} bytes`);
        assert.ok(binary - hello > 150_000, `${target}: ${binary} vs ${hello}`);
        assert.ok(
            protocol - hello > 80_000,
            `${target}: ${protocol} vs ${hello}`,
        );
    }
});

test("iterator helpers are linked only when reachable", () => {
    for (const target of ["win32-x64", "linux-x64"] as const) {
        const hello = image('console.log("hi");', {}, target).length;
        const linked = image(
            'console.log("hi");',
            { link: ["iteratorHelpers"] },
            target,
        ).length;
        const used = image(
            "function* g() { yield 1; } console.log(g().toArray().length);",
            {},
            target,
        ).length;
        assert.ok(linked - hello > 8_000, `${target}: ${linked} vs ${hello}`);
        assert.ok(used - hello > 8_000, `${target}: ${used} vs ${hello}`);
    }
});

test("syntax helpers are linked by the calls of the lowered program", () => {
    const parts = (source: string) =>
        [...requiredSyntaxParts([compileToIR(source)])].sort();
    assert.deepEqual(parts('console.log("hi");'), []);
    assert.deepEqual(parts("with ({ a: 1 }) a;"), ["withStatement"]);
    assert.deepEqual(parts('eval("1 + 1");'), ["evalCode"]);
    assert.deepEqual(parts("class A { static { g(); } }"), ["classElements"]);
    assert.deepEqual(parts("class A { #x; m() { return this.#x; } }"), [
        "classElements",
    ]);
    // Plain classes and public fields (defined inline) need none of them.
    assert.deepEqual(parts("class A { m() {} static s() {} }"), []);
    assert.deepEqual(parts("class A { x = 1; }"), []);
    // x.end(JSON.stringify(...)) may take node:http's UTF-8 byte path (#155).
    assert.deepEqual(parts("res.end(JSON.stringify({ a: 1 }, null, 2));"), [
        "jsonResponse",
    ]);
    for (const other of [
        "res.end(JSON.stringify(...args));",
        "res.end(JSON.stringify(a), 'utf8');",
        "res.write(JSON.stringify(a));",
        "res.end(JSON.parse(a));",
        "res.end(String(JSON.stringify(a)));",
        "res?.end(JSON.stringify(a));",
    ])
        assert.deepEqual(parts(other), [], other);
    for (const target of ["win32-x64", "linux-x64"] as const) {
        const hello = image('console.log("hi");', {}, target).length;
        const fields = image(
            "class A { #x = 1; get x() { return this.#x; } } console.log(new A().x);",
            {},
            target,
        ).length;
        // The inline method, call/apply and direct-call sites of the preludes
        // (#47) take about 42 KB; the Eisel-Lemire string-to-number path
        // (#466) adds about 6 KB, and the shortest-digits number formatting
        // (#467) is part of every image.
        assert.ok(hello < 1_300_000, `${target}: ${hello} bytes`);
        assert.ok(fields - hello > 8_000, `${target}: ${fields} vs ${hello}`);
    }
});

test("built-ins implemented in preludes print as native code", () => {
    const run = runOnHost(
        'console.log([String.prototype.match, Promise.prototype.then, Reflect.apply].map(String).join("|"));',
    );
    assert.equal(run.status, 0, run.stderr);
    const parts = run.stdout.trim().split("|");
    assert.equal(parts.length, 3);
    for (const part of parts) assert.match(part, /\[native code\]/);
});

test("compile reports why each optional part is linked", () => {
    const result = compile(
        'new Proxy({}, {}); "x".normalize(); [3, 1].sort();',
        {
            fileName: "/app.js",
            target: "linux-x64",
            link: ["url"],
            reportLink: true,
        },
    );
    assert.ok(result.ok);
    assert.deepEqual(result.linked, [
        {
            part: "unicodeNormalization",
            reason: '"normalize" in the source',
        },
        { part: "proxy", reason: '"Proxy" in the source' },
        { part: "binaryData", reason: "needed by encoding" },
        { part: "encoding", reason: "needed by url" },
        { part: "url", reason: "requested with --link" },
        { part: "arraySort", reason: '"sort" in the source' },
    ]);
    const bad = compile("", {
        fileName: "/app.js",
        target: "linux-x64",
        link: ["nothing"],
    });
    assert.ok(!bad.ok);
    assert.equal(bad.diagnostics[0]!.code, "E_OPTION");
});
