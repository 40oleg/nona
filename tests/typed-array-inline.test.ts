import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Element sites whose key is a proven Number (numbers.ts) access typed array
// elements inline and fall back to rt.elementGet / rt.elementSet (#240).

function expectOracle(source: string, gcStress = true): void {
    const native = runOnHost(source, { gcStress });
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, runOracle(source).stdout);
}

// `+k` makes the key a Number whatever k is, so these sites take the inline path.
const helpers = `
function get(a, k) { const j = +k; return a[j]; }
function put(a, k, v) { const j = +k; a[j] = v; return a[j]; }
function show(x) { return typeof x === 'number' && Object.is(x, -0) ? '-0' : String(x); }
function sum(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
function fill(a, f) { for (let i = 0; i < a.length; i++) a[i] = f(i); return a; }
function list(a) { const out = []; for (let i = 0; i < a.length; i++) out.push(show(a[i])); return out.join(); }
`;

test("counted loops read and write every element type", () =>
    expectOracle(
        helpers +
            `
const values = [0, 1, -1, 300, -129, 70000, 2 ** 31, 2 ** 32 + 5, 1.5, -1.5, 2.5, NaN, Infinity, -Infinity, -0, 2 ** 53, 1e20, 0.1];
for (const C of [Uint8Array, Int8Array, Uint8ClampedArray, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array]) {
    const a = fill(new C(values.length), (i) => values[i]);
    console.log(C.name, list(a), sum(a));
    for (let i = 0; i < values.length; i++) console.log(show(put(a, i, values[i])));
}
for (const C of [BigInt64Array, BigUint64Array]) {
    const a = fill(new C(4), (i) => BigInt(i) - 2n);
    const out = [];
    for (let i = 0; i < a.length; i++) out.push(typeof a[i] + ':' + a[i]);
    a[0] = 2n ** 64n + 7n;
    console.log(C.name, out.join(), get(a, 0), typeof get(a, 1));
    try { put(a, 1, 5); } catch (e) { console.log(e.constructor.name); }
}
`,
    ));

test("out-of-range, negative, fractional, NaN and -0 keys", () =>
    expectOracle(
        helpers +
            `
for (const C of [Uint8Array, Int32Array, Float64Array]) {
    const a = new C([1, 2, 3]);
    for (const k of [0, 2, 3, 100, -1, 1.5, NaN, -0, Infinity, -Infinity, 2 ** 32, 2 ** 64, -(2 ** 63)])
        console.log(C.name, show(k), show(get(a, k)), show(put(a, k, 9)));
    console.log(list(a), Object.keys(a).join(), a.length);
}
`,
    ));

test("Uint8 wraps, Uint8ClampedArray rounds and non-Number values convert in order", () =>
    expectOracle(
        helpers +
            `
const u = new Uint8Array(2), c = new Uint8ClampedArray(6), f = new Float64Array(2);
for (let i = 0; i < 2; i++) u[i] = 300 + i;
const clamp = [1.5, 2.5, 300, -5, 0.5, NaN];
for (let i = 0; i < c.length; i++) c[i] = clamp[i];
console.log(list(u), list(c));
const logged = { valueOf() { console.log('valueOf'); return 77; } };
for (let i = 0; i < 2; i++) { u[i] = logged; f[i] = '1.25'; }
for (let i = 5; i < 6; i++) u[i] = logged;
console.log(list(u), list(f));
for (let i = 0; i < 1; i++) { u[i] = true; f[i] = undefined; }
console.log(list(u), list(f));
try { for (let i = 0; i < 1; i++) f[i] = 1n; } catch (e) { console.log(e.constructor.name); }
const big = new BigInt64Array(1);
try { for (let i = 0; i < 1; i++) big[i] = 1; } catch (e) { console.log(e.constructor.name); }
for (let i = 0; i < 1; i++) big[i] = { valueOf() { return 3n; } };
console.log(big[0]);
`,
    ));

test("detached buffers, resizable buffers and subarrays", () =>
    expectOracle(
        helpers +
            `
const a = fill(new Float64Array(4), (i) => i + 0.5);
const moved = a.buffer.transfer();
console.log(a.length, sum(a), show(get(a, 0)), show(put(a, 0, 1)), new Float64Array(moved).join());
const b = fill(new Int32Array(6), (i) => i * 10);
let s = 0;
for (let i = 0; i < 6; i++) { if (i === 3) b.buffer.transfer(); s += b[i] === undefined ? 1000 : b[i]; b[i] = 7; }
console.log(s, b.length);
const rab = new ArrayBuffer(16, { maxByteLength: 64 });
const tracking = new Uint8Array(rab), fixed = new Uint8Array(rab, 4, 8);
fill(tracking, (i) => i + 1);
console.log(list(tracking), list(fixed));
let seen = [];
for (let i = 0; i < 16; i++) { if (i === 6) rab.resize(8); seen.push(show(tracking[i])); tracking[i] = 50; }
console.log(seen.join(), list(tracking), fixed.length, show(get(fixed, 0)));
rab.resize(32);
fill(tracking, (i) => 200 + i);
console.log(tracking.length, list(fixed), sum(tracking));
const base = fill(new Uint8Array(8), (i) => i);
const sub = base.subarray(3, 6), words = new Uint16Array(base.buffer, 2, 2);
for (let i = 0; i < sub.length; i++) sub[i] = sub[i] * 10;
for (let i = 0; i < words.length; i++) words[i] = 0x0101 * (i + 1);
console.log(list(sub), list(base), list(words));
`,
    ));

test("shared buffers, proxies, strings and ordinary arrays", () =>
    expectOracle(
        helpers +
            `
const shared = fill(new Int32Array(new SharedArrayBuffer(16)), (i) => -i);
console.log(list(shared), sum(shared));
const target = new Float64Array([1, 2]);
const proxy = new Proxy(target, {
    get(t, k) { return typeof k === 'string' && k !== 'length' ? 'p' + k : Reflect.get(t, k); },
    set(t, k, v) { console.log('set', k, v); return Reflect.set(t, k, v); },
});
const read = [];
for (let i = 0; i < proxy.length; i++) { read.push(proxy[i]); proxy[i] = i + 10; }
console.log(read.join(), list(target));
const text = 'héllo';
const units = [];
for (let i = 0; i < 6; i++) units.push(text[i]);
console.log(units.join());
Object.defineProperty(Object.prototype, '0', { get() { return 'inherited'; }, set(v) { console.log('setter', v); }, configurable: true });
const holes = [, 1, , 3];
const out = [];
for (let i = 0; i < holes.length; i++) out.push(holes[i]);
for (let i = 0; i < 1; i++) holes[i] = 5;
console.log(out.join(), holes.hasOwnProperty(0), holes[0]);
delete Object.prototype[0];
const plain = { 0: 'a', 1: 'b', length: 2 };
for (let i = 0; i < plain.length; i++) { out.push(plain[i]); plain[i] = i; }
console.log(out.join(), plain[0], plain[1]);
`,
    ));

test("the counted loop of a Float64Array reads its elements inline", () => {
    const result = compile(
        "function f(a){let s=0; for(let i=0;i<a.length;i++) s+=a[i]; return s}\nconsole.log(f(new Float64Array([1, 2])));\n",
        { fileName: "/app.js", target: "linux-x64", printAsm: true },
    );
    assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics));
    const f = result
        .assembly!.split(/^js\.fn\.0:$/m)[1]!
        .split(/^js\.fn\.0\.end:$/m)[0]!;
    assert.match(f, /movsd xmm0, \[r11\]/, "the inline Float64 load");
    assert.match(f, /call rt\.elementGet/, "the fallback");
});
