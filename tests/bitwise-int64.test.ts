import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// The bitwise operators take ToInt32 inline for every integral Number in the
// int64 range, not only for int32 values (#402); fractions, NaN, ±Infinity,
// |x| >= 2^63 and non-Numbers keep the runtime path.
test("bitwise operators on integers beyond int32 match Node.js", () => {
    const source = `const values = [0, -0, 1, -1, 31, 32, 33, 2147483647, -2147483648, 2 ** 31, -(2 ** 31) - 1, 2 ** 32, 2 ** 32 + 5, -(2 ** 32) - 5,
  4294967295, 2 ** 33 - 1, 2 ** 52 + 3, 2 ** 53, -(2 ** 53) - 2, 2 ** 62, 2 ** 63 - 1024, 2 ** 63, -(2 ** 63), -(2 ** 63) - 2048, 2 ** 64, 1e20, -1e20,
  0.5, -0.5, 2147483647.5, 4294967296.5, -4294967296.25, NaN, Infinity, -Infinity, Number.MAX_VALUE, Number.MIN_VALUE];
const show = (r) => Object.is(r, -0) ? "-0" : String(r);
let acc = 0;
for (const x of values) {
  const out = [];
  for (const y of values) out.push(x & y, x | y, x ^ y, x << y, x >> y, x >>> y);
  acc = (acc * 33 + out.reduce((p, q) => (p * 31 + q) | 0, 0)) | 0;
  console.log(out.join(","));
}
console.log(acc);
const unary = [];
for (const x of values) unary.push(show(x >>> 0), show(x | 0), show(x >> 0), show(~~x), show(x ^ 0));
console.log(unary.join(","));
// A u32 accumulator over u32 inputs crosses 2^31 on most iterations.
const t = new Uint32Array(64);
for (let i = 0; i < 64; i++) t[i] = (Math.imul(i + 1, 2654435761) >>> 0);
let s = 0, c = 0x9e3779b9, h = -1;
for (let i = 0; i < 3000; i++) {
  s = (s + t[i & 63]) >>> 0;
  c = (c ^ t[(i * 7) & 63]) >>> 0;
  h = (h * 31 + t[i & 63]) | 0;
}
console.log(s, c, h);`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("bitwise operators keep ToNumber order, side effects and errors", () => {
    const source = `const log = [];
const v = (name, n) => ({ valueOf() { log.push(name); return n; } });
console.log(v("a", 2 ** 32 + 7) >>> v("b", 33), log.join(""));
console.log(v("c", 1.5) | v("d", 2 ** 40), log.join(""));
console.log("4294967297" >>> 0, "1e10" | 0, null ^ (2 ** 35), undefined >>> 0, true << 31, [2 ** 34 + 1] & 255);
try { 1n >>> 0; } catch (e) { console.log(e.constructor.name); }
try { 1n | 2 ** 33; } catch (e) { console.log(e.constructor.name); }
console.log(String((2n ** 40n) | 1n), String(-(2n ** 40n) >> 3n));
const thrower = { valueOf() { throw new Error("boom " + log.length); } };
try { (2 ** 33) ^ thrower; } catch (e) { console.log(e.message); }
function mix(x, y) { return ((x + y) >>> 0) ^ (x | 0); }
let r = 0; for (let i = 0; i < 1000; i++) r = mix(r, 4000000000 + i);
console.log(r);
let w = 2 ** 31; const bump = () => { w = w * 2 + 1; return w; };
const seen = []; for (let i = 0; i < 40; i++) seen.push(bump() >>> 0, w | 0);
console.log(seen.join(","));`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("bitwise operators do not test the int32 range", () => {
    const result = compile(
        "function f(s, t) { return [(s + t) >>> 0, (s + t) >> 3, s ^ t]; }\nconsole.log(f(3000000000, 3000000000));\n",
        { fileName: "/app.js", target: "linux-x64", printAsm: true },
    );
    assert.ok(result.ok);
    const assembly = result.assembly!;
    const body = assembly.slice(
        assembly.indexOf("js.fn.0:"),
        assembly.indexOf("js.fn.0.end:"),
    );
    const hot = body.split(/call rt\.shiftUnsigned/)[0]!;
    assert.match(hot, /cvttsd2si r10, xmm0/);
    assert.doesNotMatch(body, /cmp r11, r10/);
    // >> sign-extends the low 32 bits; & | ^ << convert them as an int32,
    // so no sign extension sits on the operands' data path.
    assert.match(body, /4d 63 d2\s+movsxd r10, r10d/);
    assert.match(body, /f2 41 0f 2a c2\s+cvtsi2sd xmm0, r10d/);
});
