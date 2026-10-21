import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Unboxed Number locals and int32 induction variables (#424): Node.js oracle
// under GC stress. Each case runs the same program on the host and in Node.js.

function same(source: string): void {
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
}

test("accumulators keep NaN, infinities and -0", () => {
    same(`function negz(n) { let s = -0; for (let i = 0; i < n; i++) s = s * 1; return [1 / s, Object.is(s, -0)]; }
function negsum(n) { let s = -0; for (let i = 0; i < n; i++) s = s + -0; return 1 / s; }
function possum(n) { let s = -0; for (let i = 0; i < n; i++) s = s + 0; return 1 / s; }
function nan(n) { let s = 1; for (let i = 0; i < n; i++) s = s + NaN; return [s, s !== s]; }
function inf(n) { let s = 1; for (let i = 0; i < n; i++) s = s * 10; return s; }
function ninf(n) { let s = -1; for (let i = 0; i < n; i++) s = s * 1e200; return s; }
function infdiff(n) { let s = Infinity; for (let i = 0; i < n; i++) s = s - Infinity; return s; }
function mulzero(n) { let s = 5; for (let i = 0; i < n; i++) s = s * -0; return 1 / s; }
function divz(n) { let s = 1, d = 0; for (let i = 0; i < n; i++) s = s / d; return s; }
console.log(negz(5), negsum(5), possum(5), nan(4), inf(400), ninf(3), infdiff(2), mulzero(3), divz(1));
console.log(negz(0), nan(0), inf(0));`);
});

test("int32 counters near the int32 bounds with < and <=", () => {
    same(`function up(lo, hi) { let c = 0; for (let i = lo; i < hi; i++) c += i & 3; return c; }
function upEq(lo, hi) { let c = 0, last; for (let i = lo; i <= hi; i++) { c += 1; last = i; } return c + ":" + last; }
function downEq(lo, hi) { let c = 0, last; for (let i = hi; i >= lo; i--) { c += 1; last = i; } return c + ":" + last; }
function downLt(hi) { let last; for (let i = hi; i > -2147483650; i--) { last = i; if (i < -2147483646) break; } return last; }
function ret(n) { let i = 0; for (; i <= n; i++) { } return i; }
console.log(up(2147483640, 2147483647), up(2147483640, 2147483648), up(-2147483648, -2147483640));
console.log(upEq(2147483640, 2147483647), upEq(2147483645, 2147483648), upEq(-2147483648, -2147483646));
console.log(downEq(-2147483648, -2147483643), downEq(-2147483650, -2147483646), downLt(-2147483644));
console.log(ret(-1), ret(0), ret(5));`);
});

test("counters that must stay doubles", () => {
    same(`function half(n) { let c = 0, i = 2147483646; for (; i < n; i += 0.5) c++; return c + ":" + i; }
function wrap(n) { let c = 0, i = 2147483646; for (; i < n; i++) c++; return c + ":" + i; }
function nanBound(n) { let c = 0; for (let i = 0; i < n; i++) c++; return c; }
function fracBound(n) { let c = 0, last = -1; for (let i = 0; i < n; i++) { c++; last = i; } return c + ":" + last; }
function fracLe(n) { let c = 0, last = -1; for (let i = 0; i <= n; i++) { c++; last = i; } return c + ":" + last; }
function fracStart(n) { let s = 0; for (let i = 0.25; i < n; i++) s += i; return s; }
function big53(n) { let c = 0, i = 2 ** 53 - 3; for (; i < n; i++) { c++; if (c > 6) break; } return c + ":" + i; }
function stuck(n) { let c = 0, i = 2 ** 53; for (; i < n && c < 5; i++) c++; return c + ":" + i; }
function neg(n) { let c = 0; for (let i = -2147483650; i < n; i++) c++; return c; }
console.log(half(2147483650), wrap(2147483650), nanBound(NaN), nanBound(3), nanBound(Infinity > 5 ? 4 : 0));
console.log(fracBound(2.5), fracBound(-0.5), fracLe(2.5), fracLe(3), fracStart(4.5), neg(-2147483645));
console.log(big53(2 ** 53 + 10), stuck(2 ** 53 + 10), fracBound(1e-9));`);
});

test("loops with calls, closures, try/catch/finally and escapes", () => {
    same(`function id(x) { return x; }
function withCall(n) { let s = 0; for (let i = 0; i < n; i++) s = s + id(i) * 0.5; return s; }
function closure(n) { let s = 0; const f = () => s; for (let i = 0; i < n; i++) { s = s + i / 4; if (i === 3) console.log("mid", f()); } return f(); }
function inc(n) { let s = 0; const add = (d) => { s += d; }; for (let i = 0; i < n; i++) { s = s * 1.5; add(i); } return s; }
function thrower(n) { let s = 0, i = 0; try { for (; i < n; i++) { s = s + i * 0.5; if (i === 7) throw new Error("e" + i); } } catch (e) { return e.message + ":" + s + ":" + i; } return "none"; }
function fin(n) { let s = 1, i = 0; try { for (; i < n; i++) { s = s * 2; if (i === 4) throw s; } } catch (e) { s = s + e; } finally { s = s + i; } return s; }
function thrownan(n) { let s = 0, i = 0; try { for (; i < n; i++) { s = s + (i === 3 ? NaN : i); if (i === 5) throw 0; } } catch { return [s, i]; } }
function nestedTry(n) { let s = 0; for (let i = 0; i < n; i++) { try { s = s + i; if (i % 3 === 0) throw i; } catch (e) { s = s - e / 2; } finally { s = s + 0.25; } } return s; }
function valueOfCall(n) { let s = 0; const o = { valueOf() { return 2.5; } }; for (let i = 0; i < n; i++) s = s + o; return s; }
function strMix(n) { let s = 0; for (let i = 0; i < n; i++) s = s + (i === 2 ? "x" : 1); return s; }
function stored(n) { let s = 0; const a = []; for (let i = 0; i < n; i++) { s = s + 0.5; a[i] = s; } return a.join(); }
console.log(withCall(10), closure(8), inc(6), thrower(20), fin(9), thrownan(9), nestedTry(10), valueOfCall(4), strMix(4), stored(5));`);
});

test("break, continue, nested loops and x4 accumulators", () => {
    same(`function brk(n) { let s = 0; for (let i = 0; i < n; i++) { if (i === 17) break; s += i * 0.5; } return s; }
function cont(n) { let s = 0; for (let i = 0; i < n; i++) { if (i % 3 === 0) continue; s += i; } return s; }
function nested(n) { let s = 0; for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { if (j === 4) continue; s = s + i * j / 8; } return s; }
function labeled(n) { let s = 0; outer: for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { if (j > i) continue outer; if (i + j > 12) break outer; s = s + (i ^ j); } } return s; }
function x4(n) { let a = 0, b = 1, c = -0, d = 0.5; for (let i = 0; i < n; i += 4) { a = a + i; b = b * 1.0001; c = c + -0; d = d / 1.5 + a; } return [a, b, 1 / c, d]; }
function mulx4(n) { let p0 = 1, p1 = 1, p2 = 1, p3 = 1; for (let i = 0; i < n; i++) { p0 = p0 * 1.5; p1 = p1 * -1; p2 = p2 * 0.5; p3 = p3 * 1e154; } return [p0, p1, p2, p3]; }
function whileLoop(n) { let i = 0, s = 0; while (i < n) { s = s + i; i = i + 2; } return s + ":" + i; }
function doWhile(n) { let i = 0, s = 0; do { s = s - i; i++; } while (i < n); return s + ":" + i; }
function stepN(n) { let s = 0; for (let i = 0; i < n; i += 7) s = s + i; return s; }
function dec(n) { let s = 0; for (let i = n; i > 0; i -= 3) s = s * 0.9 + i; return s; }
console.log(brk(100), cont(50), nested(12), labeled(9), x4(40), mulx4(40), whileLoop(11), doWhile(0), stepN(100), dec(30));`);
});

test("typed-array loops and allocation while values are in registers", () => {
    same(`const t = new Float64Array(1024);
for (let j = 0; j < 1024; j++) t[j] = j % 5 === 0 ? -0 : 1 + (j % 7) / 64;
function chain(n) { let s = 0; for (let i = 0; i < n; i++) s = s + t[i & 1023]; return s; }
function mul(n) { let s = 1; for (let i = 0; i < n; i++) s = s * t[i & 1023]; return s; }
function negz(n) { let s = -0; for (let i = 0; i < n; i++) s = s + t[(i * 5) & 1023]; return 1 / s; }
function x4(n) { let a = 0, b = 0, c = 0, d = 0; for (let i = 0; i < n; i += 4) { a += t[i & 1023]; b += t[(i + 1) & 1023]; c += t[(i + 2) & 1023]; d += t[(i + 3) & 1023]; } return a + b + (c + d); }
function u32(n) { let h = 0; for (let i = 0; i < n; i++) h = (h + i * 2654435761) >>> 0; return h; }
function alloc(n) { let s = 0, q = 1; const keep = []; for (let i = 0; i < n; i++) { s = s + i * 0.25; q = q * 1.01; keep.push({ s, q, i }); if (i % 7 === 0) keep.push("str" + s); } return keep.length + ":" + s + ":" + q + ":" + keep[keep.length - 1].s + ":" + keep[5].q; }
function allocTyped(n) { let s = 0; for (let i = 0; i < n; i++) { const a = new Float64Array(4); a[i & 3] = s; s = s + a[(i + 1) & 3] + 1.5 + t[i & 1023]; } return s; }
function strCat(n) { let s = 0, str = ""; for (let i = 0; i < n; i++) { s = s + 1; str += s; } return str.length + ":" + s; }
function other(n) { let s = 0; const u = new Int32Array(8), f = new Float32Array(8); for (let i = 0; i < n; i++) { u[i & 7] = i; f[i & 7] = i / 3; s = s + u[(i + 1) & 7] + f[(i + 2) & 7]; } return s; }
console.log(chain(5000), mul(300), negz(5), x4(4000), u32(500), alloc(120), allocTyped(60), strCat(40), other(100));`);
});
