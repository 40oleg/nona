import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { regexpVmSource } from "../src/runtime/regexp-vm-source.js";

// The first-unit scan of the RegExp engine (#258): patterns whose matches can
// only start with one of up to eight code units skip ahead with
// __nonaRegexpScan, and literal runs skip ahead with indexOf.
const compileWith = (pattern: string, flags: string) =>
    (
        (0, eval)(regexpVmSource) as {
            compile(
                pattern: string,
                flags: string,
            ): {
                prefix: string | null;
                firstUnits: string | undefined;
                anchored: boolean;
            };
        }
    ).compile(pattern, flags);

test("compile finds literal runs and first-unit sets", () => {
    const cases: [string, string, string | null, string | undefined][] = [
        ["abc(\\d{3})-", "", "abc", undefined],
        ["(ab)(c)d", "", "abcd", undefined],
        ["a(?:bc)+", "", "a", undefined],
        ["[&<>\"']", "", null, "&<>\"'"],
        ["fox|dog", "", null, "fd"],
        ["k", "i", null, "kK"],
        ["s", "iu", null, "sSſ"],
        ["(?<=a)b", "", null, "b"],
        ["(?:x|y)?z", "", null, "xyz"],
        ["\\ud83d\\ude00", "u", null, "\ud83d"],
        ["[\\u{1F600}x]", "u", null, "\ud83dx"],
        // Not usable: nullable, unknown, too many units, anchored, a
        // trailing surrogate in unicode mode, non-ASCII under ignore case.
        ["a*b", "", null, "ab"],
        ["\\d", "", null, undefined],
        ["[a-z]", "", null, undefined],
        ["^ab", "", null, undefined],
        ["[\\ude00x]", "u", null, undefined],
        ["é", "i", null, undefined],
        ["(a)\\1", "", "a", undefined],
    ];
    for (const [pattern, flags, prefix, units] of cases) {
        const compiled = compileWith(pattern, flags);
        assert.equal(compiled.prefix, prefix, `/${pattern}/${flags} prefix`);
        assert.equal(compiled.firstUnits, units, `/${pattern}/${flags} units`);
    }
});

const text = String.raw`The quick brown fox, jumps over the lazy dog; KELVIN \u212a and long \u017f. 123 abc_def $x <tag attr='v'> \ud83d\ude00 smile end\ndc\udc00 a\u00e9b zz&q \"x\" abc123- abcbc xyz xy aq hq`;
const patternGroups = [
    String.raw`/[<>]/g, /fox|dog/g, /(?:ab|cd)e?/g, /k/gi, /s/giu, /K/giu, /[xyz]+/g, /(?<=a)b/g, /(?<!a)b/g, /(?=o)o\w/g`,
    String.raw`/\ud83d\ude00/gu, /[\ud83d\ude00]/gu, /\ude00/gu, /\ude00/g, /[\u{1F600}x]/gu, /[&<>"']/g, /abc(\d{3})-/g, /(ab)(c)/g, /a(?:bc)+/g, /[a-h]q/g`,
    String.raw`/(t|T)he/g, /\bthe\b/gi, /[]a/g, /(?:)x/g, /x?y?$/g, /[ab]c?/gi, /(?<n>o)(?!v)/g, /^T/gm, /e$/gm`,
];
// Without gcStress: case folding for /iu and the Unicode tables allocate
// thousands of objects, which a collection per allocation makes take minutes.
for (const [index, patterns] of patternGroups.entries())
    test(`scanned and literal-run searches match Node.js ${index}`, () => {
        const source = `const text = "${text}";
for (const p of [${patterns}]) {
  const all = [...text.matchAll(p)].map(m => m.index + ":" + m[0]);
  p.lastIndex = 0;
  console.log(String(p), all.join(" "), p.test(text), text.search(p), text.split(p).length, text.replace(p, "#").length);
}`;
        const run = runOnHost(source, { gcStress: false });
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, runOracle(source).stdout);
    });

test("sticky patterns and long inputs keep their results", () => {
    const source = `const text = "${text}";
for (const p of [/fox|dog/y, /[<>]/y, /quick/y]) { p.lastIndex = 4; const m = p.exec(text); console.log(String(p), m && m[0], p.lastIndex); }
const big = "x".repeat(300) + "<a>" + "y".repeat(300) + "fox";
console.log(big.search(/[<>]/), big.search(/fox|dog/), big.search(/[<>]q/), /k/i.test(big), big.replace(/[<>]/g, "").length);
const re = /[\\n,]/g; let count = 0; for (const piece of ("a,b\\n".repeat(20)).split(re)) count += piece.length; console.log(count);`;
    // Without gcStress, like the groups above: CI runners took over the 60 s limit.
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

// The literal strings of alternations (#389): candidates that start with
// none of them are rejected without running the matcher, and a pattern that
// is nothing but those strings matches without it.
test("literal-string alternations match Node.js", () => {
    const source = String.raw`const lv = ["INFO", "WARN", "ERROR", "DEBUG"], sv = ["auth", "billing", "gateway"];
let log = "";
for (let i = 0; i < 40; i++) log += lv[i % 4] + " [" + sv[i % 3] + "] request " + i + "\n";
log += "abd abcd ac abc y xy WARN [gateway]";
const patterns = [/(?:ERROR|WARN) \[(?:auth|gateway)\]/g, /(?:ERROR|WARN) \[(\w+)\]/g, /(?:ab|abc)d/g, /(?:a|ab)c/g, /(?:|x)y/g,
  /(?:(ERROR)|(WARN)) \[(a)?/g, /(ERROR|WARN) \[\w+\] request \d+\n\1/g, /(?:error|warn) \[auth\]/gi, /(?:ERROR|WARN) \[auth\]/gu,
  /(?<lv>ERROR|WARN) \[gateway\]$/g, /(?:FATAL|TRACE) \[x\]/g, /(?:ab|cd|ef)/g, /x|y/g, /(?:WARN|ERROR)(?= \[b)/g, /(?:WA|ER)R/dg];
for (const p of patterns) {
  const all = [...log.matchAll(p)].map((m) => m.index + ":" + m.join(",") + ":" + JSON.stringify(m.groups) + (m.indices ? JSON.stringify(m.indices) : ""));
  p.lastIndex = 0;
  console.log(String(p), all.length, all.slice(0, 6).join(" "), all.slice(-2).join(" "), log.match(p)?.length, log.search(p), log.replace(p, "#").length);
}
for (const p of [/(?:ERROR|WARN) \[/y, /(?:ab|abc)d/y, /(?:ERROR|WARN)/gy]) {
  for (const at of [0, 5, 18, 19, log.length - 15]) { p.lastIndex = at; const m = p.exec(log); console.log(String(p), at, m && m.index, m && m[0], p.lastIndex); }
}
const m = /(?:ERROR|WARN) \[auth\]/.exec("x ERROR [auth]");
console.log(Object.keys(m), JSON.stringify(Object.getOwnPropertyDescriptor(m, "index")), m.input, m.groups);
console.log("no candidates here".match(/(?:ERROR|WARN) \[x\]/g), "".match(/(?:a|b)c/g));
console.log("abg cdefg cdeg abcdefg xxWA".match(/(?:ab|cdef)g/g), "xxWA".match(/(?:WARN|ERROR)/g), "xxWAR".search(/(?:WAR|ER)N?/));
const near = /(?:WARN|ERROR)/y; near.lastIndex = 2; console.log(near.exec("xxWAR"), near.lastIndex);
Object.defineProperty(Array.prototype, "index", { set() { throw new Error("setter"); }, configurable: true });
const n = /(?:ab|cd)/.exec("xcd");
console.log(JSON.stringify(Object.getOwnPropertyDescriptor(n, "index")), n[0]);`;
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});
