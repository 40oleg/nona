
function show(x) { return typeof x === 'number' && Object.is(x, -0) ? '-0' : typeof x === 'bigint' ? x + 'n' : String(x); }
function sum(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
function sumTo(a, n) { let s = 0; for (let i = 0; i < n; i++) s += a[i]; return s; }
function list(a) { let out = ''; for (let i = 0; i < a.length; i++) out = out + a[i] + ','; return out; }
function fill(a, v) { for (let i = 0; i < a.length; i++) a[i] = v; return a; }
function iota(a) { for (let i = 0; i < a.length; i++) a[i] = i; return a; }
function copy(a, b) { for (let i = 0; i < a.length; i++) b[i] = a[i]; return b; }
function from(a, k) { let out = ''; for (let i = k; i < a.length; i++) out = out + a[i] + ','; return out; }
function signs(a) { let out = ''; for (let i = 0; i < a.length; i++) out = out + (1 / a[i] < 0 ? '-' : '+'); return out; }

const values = [0, 1, -1, 300, -129, 70000, 2 ** 31, 2 ** 32 + 5, 1.5, -1.5, 2.5, NaN, Infinity, -0, 1e20, 0.1];
for (const C of [Uint8Array, Int8Array, Uint8ClampedArray, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array]) {
    const a = new C(values.length);
    for (let i = 0; i < a.length; i++) a[i] = values[i];
    console.log(C.name, list(a), sum(a), sumTo(a, 3), sumTo(a, 2.5), sumTo(a, 100), sumTo(a, NaN), sumTo(a, '4'));
    console.log(list(fill(new C(3), 300.7)), signs(fill(new C(2), -0)), list(iota(new C(4))));
    console.log(list(fill(new C(2), '7')), list(fill(new C(2), true)), list(fill(new C(2), undefined)));
}
for (const C of [BigInt64Array, BigUint64Array]) {
    const a = new C(4);
    for (let i = 0; i < a.length; i++) a[i] = 2n ** 63n + BigInt(i);
    let total;
    try { total = sum(a); } catch (e) { total = e.constructor.name; }
    console.log(C.name, list(a), total);
    try { fill(a, 1); } catch (e) { console.log(e.constructor.name); }
    try { console.log(list(copy(a, new Float64Array(4)))); } catch (e) { console.log(e.constructor.name); }
    console.log(list(fill(a, 5n)), list(copy(a, new C(2))), list(copy(new C(2), a)));
}
const c = new Uint8ClampedArray(6), clamp = [1.5, 2.5, 300, -5, 0.5, NaN];
for (let i = 0; i < c.length; i++) c[i] = clamp[i] + 0;
console.log(list(c), list(copy(new Float64Array([254.5, 255.5, -0.5, 3.49]), new Uint8ClampedArray(4))));
const base = iota(new Uint8Array(12));
console.log(list(base.subarray(3, 7)), sum(new Int16Array(base.buffer, 2, 3)), list(copy(base.subarray(8), new Float32Array(6))));
