import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

function same(source: string) {
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
}

test("RegExp.escape escapes like Node.js", () => {
    same(String.raw`const inputs = ["", "1a", "a1", "abc", "_x", "Z9", "^$\\.*+?()[]{}|/", ",-=<>#&!%:;@~'" + "\x60\x22",
  "a b", "\t\n\v\f\r", "  ﻿      　  ",
  "x\ud83d", "\ude00x", "😀", "a😀b", "\ud83d😀\ude00", "é\x7f\x00￿", "a​b"];
for (const s of inputs) console.log(JSON.stringify(s), RegExp.escape(s));`);
});

test("RegExp.escape rejects non-strings and has the built-in shape", () => {
    same(String.raw`for (const v of [undefined, null, 1, true, {}, [], Symbol(), new String("a"), 1n, () => 1]) {
  try { RegExp.escape(v); console.log("no error"); } catch (e) { console.log(e instanceof TypeError); }
}
try { RegExp.escape(); } catch (e) { console.log(e instanceof TypeError); }
const d = Object.getOwnPropertyDescriptor(RegExp, "escape");
console.log(RegExp.escape.length, RegExp.escape.name, d.writable, d.enumerable, d.configurable);
console.log(Object.keys(RegExp).includes("escape"), typeof RegExp.escape);
try { new RegExp.escape("a"); } catch (e) { console.log(e instanceof TypeError); }
console.log("prototype" in RegExp.escape, Object.getPrototypeOf(RegExp.escape) === Function.prototype);`);
});

test("RegExp.escape output matches the input literally", () => {
    same(String.raw`const inputs = ["1a", "a.b*c", "(x)|[y]{2}", "a-b", " x ", "\n\r", "😀+", "\ud83d", "\ude00", "a😀b", "^$", "/path/to", "<tag>", "1 "];
for (const s of inputs) for (const flags of ["", "u"]) {
  const re = new RegExp(RegExp.escape(s), flags);
  const m = re.exec("zz" + s + "zz");
  console.log(JSON.stringify(s), flags, m && m.index, m && m[0] === s);
  console.log(new RegExp("^" + RegExp.escape(s) + "$", flags).test(s));
}`);
});
