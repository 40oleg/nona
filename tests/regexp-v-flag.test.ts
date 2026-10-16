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
