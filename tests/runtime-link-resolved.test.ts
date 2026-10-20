// Runtime part selection from the resolved AST (#438): local names and
// ordinary string data do not link optional parts; every real use does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import {
    compile,
    compileToIR,
    type CompileOptions,
    type Target,
} from "../src/compiler.js";
import { collectSourceUsage, lex } from "../src/frontend/lexer.js";
import { parse } from "../src/frontend/parser.js";
import {
    preludeSet,
    runtimeRegExpLink,
    syntaxOnlyPreludes,
    type RuntimeLink,
} from "../src/link.js";

function image(
    source: string,
    options: Partial<CompileOptions>,
    target: Target,
): Uint8Array {
    const result = compile(source, { fileName: "/app.js", target, ...options });
    assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics));
    return result.image;
}

const parts = (used: RuntimeLink) =>
    [
        ...(
            [
                "regexp",
                "unicodeProperties",
                "unicodeSets",
                "unicodeStringProperties",
                "unicodeNormalization",
                "float16",
            ] as const
        ).filter((part) => used[part]),
        ...Object.entries(used.preludes)
            .filter(([, on]) => on)
            .map(([name]) => name),
    ]
        .sort()
        .join(",");
const usage = (source: string, module = false) =>
    collectSourceUsage(() => parse(lex(source, { module }), { module }));
const linked = (source: string, module = false) =>
    parts(usage(source, module).usage);

test("strings and local names select no optional parts", () => {
    for (const source of [
        'console.log("hello")',
        'console.log("normalize")',
        'console.log("link")',
        "console.log(`bold ${1} small`)",
        "let bold, small, link, normalize, match; console.log(bold, small, link, normalize, match)",
        "const bold = 1, small = 2; console.log(bold + small)",
        "function f(Proxy, RegExp) { return new Proxy(RegExp) }",
        "function f() { const { a: normalize } = o; return normalize() }",
        "try {} catch (bold) { bold() }",
        "for (const link of xs) link()",
        "(function bold() { return bold })",
        "(bold) => bold",
        "class Proxy {} new Proxy()",
        "const o = { normalize: 1, bold() {} }; class C { link() {} static small = 1 }",
        'const labels = { label: "normalize", title: "Proxy" }',
        // `with` is syntax, not the Array.prototype.with method.
        "with (o) x",
        // Numeric keys are not dynamic property names.
        'const k = "normalize"; for (let i = 0; i < 2; i++) a[i]; a[a.length - 1]; a[0]',
    ])
        assert.equal(linked(source), "", source);
    // A \p{…} string is data for the property tables, which need the engine.
    assert.equal(
        linked(String.raw`console.log("\\p{L}")`),
        "unicodeProperties",
    );
    assert.deepEqual(
        runtimeRegExpLink(usage(String.raw`console.log("\\p{L}")`).usage),
        {
            regexp: false,
            unicodeProperties: false,
            unicodeSets: false,
            unicodeStringProperties: false,
        },
    );
    assert.equal(linked("var link = 1; link", true), "");
    assert.equal(linked("import bold from './x.js'; bold()", true), "");
});

test("real uses still select their parts", () => {
    const normalization = "unicodeNormalization",
        regexp = "regexp,unicodeProperties";
    for (const [source, expected] of [
        ['"x".normalize()', normalization],
        ['s["normalize"]()', normalization],
        ["s[`normalize`]()", normalization],
        ["s?.normalize()", normalization],
        ["const { normalize: n } = String.prototype", normalization],
        ["({ normalize } = String.prototype)", normalization],
        ['const { ["normalize"]: n } = String.prototype', normalization],
        ['"normalize" in s', normalization],
        ['Reflect.get(String.prototype, "normalize")', normalization],
        [
            'Object.getOwnPropertyDescriptor(String.prototype, "normalize")',
            normalization,
        ],
        ['String.prototype.hasOwnProperty("normalize")', normalization],
        [
            'Object.prototype.hasOwnProperty.call(String.prototype, "normalize")',
            normalization,
        ],
        // A key unknown at compile time may be any string of the program.
        ['const k = "normalize"; s[k]()', normalization],
        ['const k = "normalize"; k in s', normalization],
        ['const k = "normalize"; Reflect.get(s, k)', normalization],
        ['"a".localeCompare("b")', "intl,unicodeNormalization"],
        [String.raw`/\p{L}/u`, regexp],
        [String.raw`new RegExp("\\p{L}", "u")`, regexp],
        ["const R = RegExp; new R(p)", regexp],
        [String.raw`s.match("\\p{L}")`, regexp],
        ['"a".bold()', "annexB"],
        ['"a"["link"]("x")', "annexB"],
        ["with (String.prototype) bold", "annexB"],
        ["function f(o) { with (o) return small }", "annexB"],
        ["function f(s) { eval(s); var bold; return bold }", "annexB"],
        ['globalThis["Proxy"]', "proxy,timers"],
        ["class A extends B { m() { return super.link } }", "annexB"],
        ['require("node:buffer")', "buffer"],
        ['Symbol.for("nona.events.internal")', "events"],
        // A local elsewhere does not hide the global.
        ["function f() { let Proxy = 1 } new Proxy({}, {})", "proxy"],
        // A script's top-level var may still hold the built-in.
        ["var Proxy; new Proxy({}, {})", "proxy"],
    ] as [string, string][])
        assert.equal(linked(source), expected, source);
    assert.equal(linked('import { stdout } from "node:process"', true), "stream");
    assert.equal(linked('import("node:stream")', true), "stream");
    assert.equal(linked('export { link } from "./x.js"', true), "annexB");
    assert.equal(linked("import { bold } from './x.js'", true), "annexB");
});

test("enumeration and nested collections keep their conservative rules", () => {
    const all = Object.keys(preludeSet(true))
        .filter((name) => !(syntaxOnlyPreludes as string[]).includes(name))
        .sort()
        .join(",");
    for (const source of [
        "Object.getOwnPropertyNames(o)",
        "Reflect.ownKeys(o)",
        'const k = "getOwnPropertyNames"; Object[k](o)',
    ]) {
        const preludes = usage(source).usage.preludes;
        assert.equal(
            Object.entries(preludes)
                .filter(([, on]) => on)
                .map(([name]) => name)
                .sort()
                .join(","),
            all,
            source,
        );
    }
    // The dynamic-key fallback covers every source of one collection,
    // nested collections included.
    const outer = collectSourceUsage(() => {
        parse(lex('const k = "normalize"'));
        collectSourceUsage(() => parse(lex("s[key]()")));
    });
    assert.equal(outer.usage.unicodeNormalization, true);
    assert.equal(
        outer.reasons.unicodeNormalization,
        '"normalize" in a string (dynamic property access)',
    );
    const report = compile('const k = "link"; console.log(""[k]("x"));', {
        fileName: "/app.js",
        target: "linux-x64",
        reportLink: true,
    });
    assert.ok(report.ok);
    assert.deepEqual(report.linked, [
        {
            part: "annexB",
            reason: '"link" in a string (dynamic property access)',
        },
    ]);
});

test("string probes are the size of a program without them", () => {
    for (const target of ["win32-x64", "linux-x64"] as const) {
        const hello = image('console.log("hello");', {}, target).length;
        for (const source of [
            'console.log("normalize");',
            String.raw`console.log("\\p{L}");`,
            'console.log("link");',
            "const bold = 1, small = 2; console.log(bold + small);",
        ]) {
            const size = image(source, {}, target).length;
            assert.ok(
                // The program's own code differs by a few kilobytes.
                Math.abs(size - hello) < 16_384,
                `${target} ${source}: ${size} vs ${hello} bytes`,
            );
        }
        // --link and --full-runtime still add the parts.
        const normalize = image(
            'console.log("normalize");',
            { link: ["unicodeNormalization"] },
            target,
        ).length;
        assert.ok(normalize - hello > 300_000, `${target}: ${normalize}`);
        const full = image('console.log("link");', { fullRuntime: true }, target)
            .length;
        assert.ok(full - hello > 3_000_000, `${target}: ${full}`);
    }
});

test("programs that use the parts run like Node.js with the selected link", () => {
    for (const source of [
        String.raw`console.log("Å".normalize().length, "x"["normalize"]("NFD"));`,
        String.raw`const { normalize: n } = String.prototype; console.log(n.call("Å").length);`,
        String.raw`const k = "normalize"; console.log("Å"[k]().length);`,
        String.raw`console.log(new RegExp("\\p{L}+", "u").exec("ab1")[0], "x1".match("[a-z]")[0]);`,
        String.raw`console.log(/\p{Lu}/u.test("A"), "a".bold(), "a"["link"]("x"));`,
        "with (String.prototype) console.log(typeof bold, typeof small);",
        'console.log(typeof globalThis["Proxy"], "normalize" in String.prototype, typeof Reflect.get(String.prototype, "anchor"));',
    ]) {
        const { usage: link } = collectSourceUsage(() => compileToIR(source));
        const run = runOnHost(source, { gcStress: true, link });
        assert.equal(run.error, undefined, source);
        assert.equal(run.status, 0, `${source}\n${run.stderr}`);
        assert.equal(run.stdout, runOracle(source).stdout, source);
    }
});
