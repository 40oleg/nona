import { test } from "node:test";
import assert from "node:assert/strict";
import { compileToIR } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

function sameAsNode(source: string, gcStress = true): void {
    const run = runOnHost(source, { gcStress });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
}

test("the flags string lists every flag in specification order", () =>
    sameAsNode(String.raw`
console.log(new RegExp("x", "ysmig").flags, new RegExp("x", "vgimsy").flags);
console.log(/x/gimsvy.flags, /x/v.flags, /x/u.flags, /x/gimsuy.flags);
console.log(String(/a/v), /a/v.source);
`));

test("the unicodeSets getter follows the unicode getter rules", () =>
    sameAsNode(String.raw`
const get = Object.getOwnPropertyDescriptor(RegExp.prototype, "unicodeSets").get;
console.log(/x/v.unicodeSets, /x/u.unicodeSets, /x/.unicodeSets, new RegExp("x", "v").unicodeSets);
console.log(RegExp.prototype.unicodeSets, RegExp.prototype.unicode);
console.log(typeof get, get.name, "unicodeSets" in RegExp.prototype);
for (const receiver of [{}, 1, "x", null, undefined]) {
  try { get.call(receiver); console.log("no error"); } catch (e) { console.log(e instanceof TypeError); }
}
`));

test("u and v together are rejected by the constructor", () =>
    sameAsNode(String.raw`
for (const flags of ["uv", "vu", "guvy", "vv", "vx"]) {
  try { new RegExp("x", flags); console.log("accepted", flags); }
  catch (e) { console.log(e instanceof SyntaxError, flags); }
}
console.log(new RegExp("x", "gv").flags);
`));

test("u and v together are rejected in a literal", () => {
    assert.throws(
        () => compileToIR("const r = /x/uv;"),
        /Invalid regular expression flags/,
    );
    assert.throws(
        () => compileToIR("const r = /x/vu;"),
        /Invalid regular expression flags/,
    );
    assert.throws(
        () => compileToIR("const r = /x/vv;"),
        /Invalid regular expression flags/,
    );
});

test("v behaves as u for dot, surrogate pairs and index advance", () =>
    sameAsNode(String.raw`
const smile = "a\u{1F600}b";
console.log(/./v.exec("\u{1F600}")[0].length, /^.$/v.test("\u{1F600}"), /^.$/.test("\u{1F600}"));
console.log(/\u{1F600}/v.test(smile), /\ud83d\ude00/v.test(smile), /\ud83d/v.test(smile));
console.log(smile.split(new RegExp("", "v")).length, smile.split(new RegExp("", "u")).length);
console.log([...smile.matchAll(new RegExp("", "gv"))].map(m => m.index).join());
console.log(smile.replace(new RegExp("", "gv"), "-"));
console.log(smile.match(new RegExp("", "gv")).length);
const sticky = /\u{1F600}/vy; sticky.lastIndex = 1;
console.log(sticky.test(smile), sticky.lastIndex);
console.log(/(?:)/iv.test(smile), smile.search(/\u{1F600}/v));
`));

test("v mode applies the strict escape and quantifier rules of u mode", () =>
    sameAsNode(String.raw`
for (const pattern of ["\\-", "a{", "]", "\\1", "\\k<a>", "(?<a>x)\\k<b>", "\\u{110000}", "x{2,1}"]) {
  for (const flags of ["u", "v"]) {
    try { new RegExp(pattern, flags); console.log("ok", pattern, flags); }
    catch (e) { console.log(e.name, pattern, flags); }
  }
}
`));

test("v supports Unicode property escapes", () =>
    // Without gcStress: loading the property tables allocates heavily.
    sameAsNode(
        String.raw`
console.log(/\p{L}+/v.exec("12héllo wörld")[0], /^\P{L}+$/v.test("12 "));
console.log(/\p{Script=Greek}/v.test("\u03b1"), /^\p{L}$/v.test("\u{1D400}"));
console.log("a1b2".replace(/\p{Nd}/gv, "#"));
`,
        false,
    ));

test("v-mode classes nest and support union, intersection and subtraction", () =>
    sameAsNode(String.raw`
const show = (re, input) => { const m = re.exec(input); return m === null ? "null" : m[0] + "@" + m.index; };
console.log(show(/[[a-z]--[aeiou]]+/v, "queue strength"), show(/[[a-z]&&[^aeiou]]+/v, "aeiubcd"));
console.log(show(/[a--b--c]/v, "cba"), show(/[\d--3]+/v, "3456"), show(/[a&&a&&a]/v, "a"));
console.log(show(/[[a-f]&&[d-z]&&[^e]]+/v, "abcdefg"), show(/[[a-z]--[b-y]--a]+/v, "abz"));
console.log(show(/[[[a-c]--b][x-z]]+/v, "abcxyz"), show(/[\w--\d--_]+/v, "_9ab_"));
console.log(show(/[]/v, "a"), show(/[^]/v, "a"), show(/[[]]/v, "a"), show(/[^[]]/v, "a"), show(/[^[^a]]/v, "ba"));
console.log(show(/[a&b]+/v, "x&ab&"), show(/[\-\&\!\#\%\,\:\;\<\=\>\@\~]+/v, "a-&!#%,:;<=>@~"));
console.log(show(/[\s--\n]+/v, "a\n \t"), show(/[\b]/v, "a\b"), show(/[^\d\s]+/v, "12 ab3"));
console.log("a1b2c3".replace(/[\w--\d]/gv, "*"), /^[[\x00-\u{10FFFF}]--\x01]$/v.test("\x01"));
`));

test("\\q{} string disjunctions match the longest string first", () =>
    sameAsNode(String.raw`
const show = (re, input) => { const m = re.exec(input); return m === null ? "null" : m[0] + "@" + m.index; };
console.log(show(/[\q{abc|ab|a}]/v, "xabcd"), show(/[\q{a|ab|abc}]/v, "xabd"), show(/[\q{a|ab}c]/v, "abc"));
console.log(show(/[\q{abc|ab}d]/v, "dab"), show(/[\q{abc|ab}]d/v, "abd"), show(/^[\q{abc|ab}]+$/v, "ababcab"));
console.log(show(/[\q{|x}]/v, "y"), show(/[\q{|x}]y/v, "y"), show(/[\q{}]/v, "z"), show(/a[\q{}]b/v, "ab"));
console.log(show(/[\q{ab|cd}--\q{ab}]/v, "abcd"), show(/[\q{ab|c}&&\q{ab}]/v, "cab"), show(/[\q{ab|c}--c]/v, "cab"));
console.log(show(/[\q{a\-b|\u{1F600}\u{1F601}}]/v, "a-b"), show(/(?<=[\q{ab|b}])c/v, "abc"), show(/[\q{ab|abc}]+?d/v, "ababcd"));
console.log("xababcab".replace(/[\q{abc|ab}]/gv, "<$&>"), "ab-abc".split(/[\q{ab|\-}]/v).join("|"));
const m = /([\q{ab|a}])(b?)/v.exec("ab");
console.log(m[1], JSON.stringify(m[2]), /[^\q{a|b}]/v.test("c"));
`));

test("v mode with ignore case folds operands before set operations", () =>
    // Without gcStress: loading the property tables allocates heavily.
    sameAsNode(
        String.raw`
console.log(/\P{Ll}/vi.test("A"), /\P{Ll}/ui.test("A"), /[^\P{Ll}]/vi.test("A"), /[^\P{Ll}]/ui.test("A"));
console.log(/[\p{Lowercase_Letter}--[a-z]]/vi.test("A"), /[\p{Lowercase_Letter}--[a-z]]/vi.test("\u00e9"), /[\p{Lowercase_Letter}--[a-z]]/vi.test("\u00c9"));
console.log(/[\w--a]/vi.test("a"), /[\w--a]/vi.test("A"), /[\w--a]/vi.test("B"), /[\w&&A]/vi.test("a"));
console.log(/[\w--[a-z]]/vi.test("K"), /[\w--[a-z]]/vi.test("\u212a"), /[^a]/vi.test("A"), /[^[a]]/vi.test("b"));
console.log(/[\q{KK|ss}]/vi.exec("xkK")[0], /[\q{ss}]/vi.test("\u017f\u017f"), /[A-Z]/vi.test("\u212a"));
console.log(/\W/vi.test("\u017f"), /[^\W]/vi.test("\u017f"), /\D/vi.test("A"), /[^\d]/vi.test("A"));
console.log(/[\p{Lu}&&[A-F]]+/vi.exec("xdEfg")[0], /[^\p{Lu}]/vi.test("a"), /\p{Lu}/vi.test("a"));
console.log("aBcD".replace(/[[a-z]--b]/giv, "_"), "\u212aK".replace(/k/giv, "k"));
`,
        false,
    ));

test("v-mode classes on surrogate pairs through the RegExp protocol", () =>
    sameAsNode(String.raw`
const text = "a\u{1F600}b\u{1F601}c\u{1F602}";
const emoji = /[[\u{1F600}-\u{1F64F}]--\u{1F601}]/gv;
console.log(text.match(emoji).join(","), text.replace(emoji, "_"), text.split(/[\u{1F600}-\u{1F64F}]/v).join("|"));
console.log([...text.matchAll(/[\q{\u{1F600}b|c}[\u{1F601}]]/gv)].map(m => m[0].length + "@" + m.index).join());
console.log(/[\uD83D\uDE00]/v.exec(text).index, /[^\u{1F600}]/v.exec("\u{1F600}x")[0], /^[^a]$/v.test("\u{1F600}"));
console.log(text.search(/[\q{c\u{1F602}}]/v), /[\uD83D]/v.test("\u{1F600}"), /[\uD83D]/v.test("\uD83D"));
const sticky = /[\q{\u{1F600}b}]/vy; sticky.lastIndex = 1;
console.log(sticky.test(text), sticky.lastIndex);
`));

test("invalid v-mode classes throw a SyntaxError", () =>
    sameAsNode(String.raw`
const sources = [
  "[(]", "[)]", "[[]", "[{]", "[}]", "[/]", "[|]", "[a-]", "[-a]", "[--]", "[a", "[[a]", "[^", "[\\",
  "[!!]", "[a##]", "[$$]", "[%%]", "[**]", "[++]", "[,,]", "[..]", "[::]", "[;;]", "[<<]", "[==]", "[>>]",
  "[??]", "[@@]", "[^^^]", "[\x60\x60]", "[~~]", "[a&&&b]", "[&&a]", "[a&&]", "[a--]", "[--a]",
  "[a&&b--c]", "[a--b&&c]", "[a-z&&b]", "[ab&&b]", "[ab--c]", "[a-c--b]", "[[a]&&[b]c]", "[a-&&b]",
  "[z-a]", "[\\x41-\\x40]", "[\\q{abc}-z]", "[a-\\q{b}]", "[\\d-z]", "[a-[b]]",
  "[\\q]", "\\q{a}", "[\\q{a|b\\}]", "[\\q{a(}]", "[\\q{a&&b}]", "[\\q{a-b}]", "[\\q{a",
  "[\\B]", "[\\1]", "[\\k<a>]", "[\\c]", "[\\01]", "[\\z]", "[\\u{110000}]", "[\\p{L}", "[\\p{Nope}]",
  "[^\\q{ab}]", "[^[\\q{ab}]]", "[^\\q{}]", "[^\\q{ab}--\\q{ab}]", "[^\\q{ab|c}&&\\q{ab}]", "[a[^\\q{ab|}]]",
];
for (const source of sources) {
  try { new RegExp(source, "v"); console.log("accepted", source); }
  catch (e) { console.log(e.name, source); }
}
const valid = ["[\\-]", "[\\&\\!\\#\\%\\,\\:\\;\\<\\=\\>\\@\\\x60\\~]", "[\\b]", "[!]", "[!a!]", "[a&b]", "[\\cA]", "[\\0]",
  "[\\q{a\\-b}]", "[^\\q{a|b}]", "[^\\q{ab}&&a]", "[^a&&\\q{ab}]", "[^[^\\q{ab}]--\\q{ab}]", "[\\q{ab}--\\q{ab}]"];
for (const source of valid) {
  try { new RegExp(source, "v"); console.log("accepted", source); }
  catch (e) { console.log(e.name, source); }
}
`));

test("invalid v-mode class literals are compile-time errors", () => {
    for (const source of [
        "[a&&&b]",
        "[a&&b--c]",
        "[a-z&&b]",
        "[(]",
        "[!!]",
        "[z-a]",
        "[^\\q{ab}]",
        "\\q{a}",
        "[\\q{a-b}]",
    ])
        assert.throws(
            () => compileToIR(`const r = /${source}/v;`),
            /Invalid regular expression/,
            source,
        );
    compileToIR(String.raw`const r = /[a&&b]/u;`);
    compileToIR(String.raw`const r = /[[a-z]--\q{ab}]/v;`);
});

// Emoji used below: keycaps, flags, the England tag sequence and ZWJ families.
const emoji = String.raw`
const keycap = "#\u{FE0F}\u{20E3}", one = "1\u{FE0F}\u{20E3}", fr = "\u{1F1EB}\u{1F1F7}", us = "\u{1F1FA}\u{1F1F8}";
const england = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
const scotland = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}", coder = "\u{1F469}\u{200D}\u{1F4BB}";
const hex = (s) => s === null ? null : [...s].map((c) => c.codePointAt(0).toString(16)).join(" ");
`;

test("properties of strings match emoji sequences, longest first", () =>
    sameAsNode(
        emoji +
            String.raw`
const samples = [
  "\u{231A}", "\u{1F600}", "\u{2764}\u{FE0F}", "a", keycap, one, "1", "\u{1F44D}\u{1F3FD}", "\u{1F44D}",
  fr, us, "\u{1F1E6}", england, "\u{1F3F4}", family, coder, "\u{1F468}",
];
for (const name of ["Basic_Emoji", "Emoji_Keycap_Sequence", "RGI_Emoji_Modifier_Sequence", "RGI_Emoji_Flag_Sequence",
                    "RGI_Emoji_Tag_Sequence", "RGI_Emoji_ZWJ_Sequence", "RGI_Emoji"]) {
  const exact = new RegExp("^\\p{" + name + "}$", "v"), inClass = new RegExp("^[\\p{" + name + "}]$", "v");
  console.log(name, samples.map((s) => (exact.test(s) ? 1 : 0) + (inClass.test(s) ? 2 : 0)).join(""));
}
const text = "a" + family + "b" + fr + "c" + keycap + "\u{1F44D}\u{1F3FD}" + england + coder + "\u{1F468}";
console.log(text.match(/\p{RGI_Emoji}/gv).map(hex).join(" | "));
console.log(text.match(/[\p{RGI_Emoji}a-b]+/gv).map(hex).join(" | "));
console.log(hex(/\p{RGI_Emoji}{2}/v.exec(fr + "\u{1F600}x")?.[0] ?? null));
console.log(text.replace(/\p{RGI_Emoji_Flag_Sequence}|\p{Emoji_Keycap_Sequence}/gv, "_").length);
console.log(/(?<=\p{RGI_Emoji})b/v.exec(text).index, /(?<![\p{RGI_Emoji}a])c/v.exec("ac" + fr + "c" + "xc")?.index);
`,
        // Loading RGI_Emoji allocates thousands of strings: too slow under gcStress.
        false,
    ));

test("properties of strings in set operations and under ignore case", () =>
    sameAsNode(
        emoji +
            String.raw`
const samples = [fr, us, family, coder, "\u{1F600}", "\u{231A}", keycap, "ab", "AB", "a"];
const patterns = [
  "[\\p{RGI_Emoji}--\\q{" + fr + "}]", "[\\p{RGI_Emoji_Flag_Sequence}--[\\q{" + fr + "|" + us + "}]]",
  "[\\p{RGI_Emoji}&&\\p{RGI_Emoji_Flag_Sequence}]", "[\\p{Basic_Emoji}&&[\\u{1F600}-\\u{1F64F}]]",
  "[\\p{RGI_Emoji}&&\\q{" + family + "|ab}]", "[\\p{Emoji_Keycap_Sequence}\\q{ab}]", "[[\\p{RGI_Emoji}--\\p{Basic_Emoji}]\\q{AB}]",
  "[^\\p{RGI_Emoji}&&\\p{L}]", "[\\p{RGI_Emoji}--\\p{Emoji}]", "[\\p{RGI_Emoji_ZWJ_Sequence}--\\q{" + family + "}]",
];
for (const source of patterns)
  for (const flags of ["v", "vi"]) {
    const re = new RegExp("^" + source + "$", flags);
    console.log(flags, samples.map((s) => re.test(s) ? 1 : 0).join(""));
  }
console.log(/^[\p{RGI_Emoji}--\q{🇫🇷}]$/v.test(fr), /^[\p{RGI_Emoji}--\q{🇫🇷}]$/v.test(us));
`,
        false,
    ));

test("small properties of strings backtrack, look behind and capture", () =>
    sameAsNode(
        emoji +
            String.raw`
console.log(/^\p{Emoji_Keycap_Sequence}+$/v.test(keycap + one), /^\p{Emoji_Keycap_Sequence}$/v.test("#"));
// The longest string fails at the end: the next shorter one is tried.
console.log(/^[\p{Emoji_Keycap_Sequence}\q{#\u{FE0F}|#}]\u{20E3}$/v.exec(keycap)[0].length);
console.log(/^(\p{Emoji_Keycap_Sequence}|[\q{#\u{FE0F}}])(\u{20E3}?)$/v.exec(keycap).map((s) => s.length).join());
console.log(("a" + england + "b").replace(/\p{RGI_Emoji_Tag_Sequence}/v, "_"));
console.log(/(?<=\p{RGI_Emoji_Tag_Sequence})b/v.exec("a" + england + "b").index);
console.log(/(?<![\p{Emoji_Keycap_Sequence}a])x/v.exec(keycap + "xaxx").index);
const notEngland = new RegExp("^[\\p{RGI_Emoji_Tag_Sequence}--\\q{" + england + "}]$", "v");
console.log(notEngland.test(england), notEngland.test(scotland));
console.log(/^[\p{Emoji_Keycap_Sequence}&&\q{1\u{FE0F}\u{20E3}|ab}]$/v.test(one));
console.log(/^[\p{Emoji_Keycap_Sequence}\q{AB}]+$/vi.test("ab" + keycap + "aB"), /^\p{Emoji_Keycap_Sequence}$/vi.test(one));
console.log((keycap + one + "x" + keycap).match(/\p{Emoji_Keycap_Sequence}/gv).length);
`,
    ));

test("properties of strings are only valid as \\p in v mode", () => {
    sameAsNode(
        String.raw`
const cases = [
  ["\\p{RGI_Emoji}", "u"], ["\\p{Basic_Emoji}", "u"], ["[\\p{RGI_Emoji_ZWJ_Sequence}]", "u"],
  ["\\P{RGI_Emoji}", "v"], ["\\P{Emoji_Keycap_Sequence}", "v"], ["[\\P{RGI_Emoji_Flag_Sequence}]", "v"],
  // The class is evaluated before its negation is checked: small properties keep this fast under gcStress.
  ["[^\\p{Emoji_Keycap_Sequence}]", "v"], ["[^[\\p{RGI_Emoji_Tag_Sequence}]]", "v"], ["[^\\p{Emoji_Keycap_Sequence}--\\q{a}]", "v"],
  ["[a[^\\p{RGI_Emoji_Tag_Sequence}]]", "v"], ["\\p{RGI_Emoji=Yes}", "v"], ["\\p{rgi_emoji}", "v"], ["\\p{Emoji_Keycap_Sequence}", "vi"],
  ["[^\\p{Emoji_Keycap_Sequence}&&a]", "v"], ["\\p{RGI_Emoji}", ""], ["[\\p{RGI_Emoji_Tag_Sequence}--\\q{a}]", "vi"],
];
for (const [source, flags] of cases) {
  try { new RegExp(source, flags); console.log("accepted", source, flags); }
  catch (e) { console.log(e.name, source, flags); }
}
`,
    );
    for (const source of [
        "\\P{RGI_Emoji}",
        "[^\\p{RGI_Emoji}]",
        "[\\P{Basic_Emoji}]",
    ])
        assert.throws(
            () => compileToIR(`const r = /${source}/v;`),
            /Invalid regular expression/,
            source,
        );
    assert.throws(
        () => compileToIR(String.raw`const r = /\p{RGI_Emoji}/u;`),
        /Invalid/,
    );
});
