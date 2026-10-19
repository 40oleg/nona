import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// The global match loop in the engine (#389): RegExp.prototype[Symbol.match]
// lets one call of the builtin exec collect every matched string when the
// expression's exec is the builtin one and its own flags agree with the
// flags read; otherwise it runs the generic loop.
test("global match collected by the engine matches Node.js", () => {
    const source = String.raw`const lv = ["INFO", "WARN", "ERROR", "DEBUG"], sv = ["auth", "billing", "gateway"];
let log = "";
for (let i = 0; i < 60; i++) log += lv[i % 4] + " [" + sv[i % 3] + "] request " + i + "\n";
const patterns = [/(?:ERROR|WARN) \[(?:auth|gateway)\]/g, /(?:ERROR|WARN) \[(\w+)\]/g, /(?:ab|abc)/g, /(?:abc|ab)/g, /aa|a/g,
  /(?:WARN|ERROR) \[auth\]/gy, /(?:INFO|WARN) /gy, /ERROR \[auth\]/g, /request \d+/g, /(?:FATAL|TRACE)/g, /e/gi, /\d+/g];
for (const p of patterns) {
  p.lastIndex = 7;
  const m = log.match(p);
  console.log(String(p), p.lastIndex, m && m.length, m && m.slice(0, 4).join("|"), m && m[m.length - 1]);
  console.log(log.replace(p, "#").length, [...log.matchAll(p)].length, p.lastIndex);
}
for (const s of ["abcabab abc", "aaaaa", "INFO WARN ERROR", ""]) console.log(JSON.stringify(s.match(/(?:ab|abc)/g)), JSON.stringify(s.match(/aa|a/g)), JSON.stringify(s.match(/(?:INFO|WARN) /gy)));`;
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("global match advances past empty matches like Node.js", () => {
    const source = String.raw`const high = String.fromCharCode(0xd83d), low = String.fromCharCode(0xde00), pair = high + low;
const texts = ["a" + pair + "b", pair + pair, "", "xx\nyy", low + high];
const patterns = [/(?:)/g, /(?:)/gu, /x*/g, /x*/gu, /(?:x|)/g, /\b/g, /$/gm, /^/gm, /[^]?/gu, /.?/gv];
for (const t of texts) for (const p of patterns) {
  const m = t.match(p);
  console.log(String(p), JSON.stringify(t), m && m.length, JSON.stringify(m), p.lastIndex);
}`;
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("global match keeps the generic loop's observable steps", () => {
    const source = String.raw`const text = "ab ab ab";
const show = (label, f) => { try { console.log(label, JSON.stringify(f())); } catch (e) { console.log(label, e.constructor.name); } };
// An exec on the instance, on RegExp.prototype and as a getter.
let calls = 0;
const own = /ab/g; own.exec = function (s) { calls++; return RegExp.prototype.exec.call(this, s); };
show("own", () => [text.match(own), calls, own.lastIndex]);
const original = RegExp.prototype.exec;
RegExp.prototype.exec = function (s) { calls++; return original.call(this, s); };
show("prototype", () => [text.match(/(?:ab|x)/g), calls]);
RegExp.prototype.exec = original;
let reads = 0;
Object.defineProperty(RegExp.prototype, "exec", { get() { reads++; return original; }, configurable: true });
show("getter", () => [text.match(/(?:ab|x)/g), reads]);
Object.defineProperty(RegExp.prototype, "exec", { value: original, writable: true, configurable: true });
// Subclasses: with and without their own exec.
class Counting extends RegExp { exec(s) { calls++; return super.exec(s); } }
class Plain extends RegExp {}
calls = 0;
show("subclass", () => [text.match(new Counting("(?:ab|x)", "g")), calls, text.match(new Plain("(?:ab|x)", "g"))]);
// lastIndex: reset to 0 first, left 0, and a non-writable one throws.
const re = /(?:ab|x)/g;
re.lastIndex = { valueOf() { calls++; return 3; } };
calls = 0;
show("lastIndex", () => [text.match(re), re.lastIndex, calls]);
const frozen = /(?:ab|x)/g; Object.defineProperty(frozen, "lastIndex", { value: 2, writable: false });
show("frozen", () => text.match(frozen));
show("frozen lastIndex", () => frozen.lastIndex);
// Flags: overrides that drop g, keep g without the y the expression has,
// or add u (with the flag property too: Node.js 22 reads global and
// unicode, the specification flags); a flags getter; and the d flag.
const noG = /(?:ab|x)/g; Object.defineProperties(noG, { flags: { value: "" }, global: { value: false } });
show("flags without g", () => { const m = text.match(noG); return [m[0], m.index, noG.lastIndex]; });
const sticky = /(?:ab|x)/gy; Object.defineProperty(sticky, "flags", { value: "g" });
show("flags without y", () => [text.match(sticky), "abab".match(sticky)]);
const addU = /(?:)/g; Object.defineProperties(addU, { flags: { value: "gu" }, unicode: { value: true } });
show("flags with u", () => (String.fromCharCode(0xd83d, 0xde00) + "x").match(addU));
const flags = Object.getOwnPropertyDescriptor(RegExp.prototype, "flags");
Object.defineProperty(RegExp.prototype, "flags", { get() { return flags.get.call(this); }, configurable: true });
show("flags getter", () => text.match(/(?:ab|x)/g));
Object.defineProperty(RegExp.prototype, "flags", flags);
show("d flag", () => text.match(/(?:ab|x)/dg));
// Not a RegExp: a Proxy and an object inheriting from RegExp.prototype.
show("proxy", () => RegExp.prototype[Symbol.match].call(new Proxy(/ab/g, {}), text));
show("fake", () => RegExp.prototype[Symbol.match].call(Object.create(RegExp.prototype, { flags: { value: "g" } }), text));
show("prototype receiver", () => RegExp.prototype[Symbol.match].call(RegExp.prototype, text));
// Array.prototype.push replaced: the collected result does not use it.
const push = Array.prototype.push;
show("push", () => { Array.prototype.push = function () { throw new Error("push"); }; try { return text.match(/(?:ab|x)/g); } finally { Array.prototype.push = push; } });`;
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("global match results survive collections", () => {
    const source = String.raw`let log = "";
for (let i = 0; i < 30; i++) log += (i % 2 ? "WARN" : "INFO") + " [auth] " + i + "\n";
const m = log.match(/(?:ERROR|WARN) \[(?:auth|gateway)\] \d/g);
const n = log.match(/(?:WARN|INFO) \[auth\]/g);
console.log(m.length, m.join("|"), n.length, n[0], n[n.length - 1], (String.fromCharCode(0xd83d, 0xde00) + "a").match(/(?:)/gu).length);`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});
