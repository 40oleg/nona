function show(x) { return typeof x === 'number' && Object.is(x, -0) ? '-0' : typeof x === 'bigint' ? x + 'n' : String(x); }
function sum(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
function sumTo(a, n) { let s = 0; for (let i = 0; i < n; i++) s += a[i]; return s; }
function list(a) { let out = ''; for (let i = 0; i < a.length; i++) out = out + a[i] + ','; return out; }
function fill(a, v) { for (let i = 0; i < a.length; i++) a[i] = v; return a; }
function iota(a) { for (let i = 0; i < a.length; i++) a[i] = i; return a; }
const values = [0, 1, -1, 300, -129, 70000, 2 ** 31, 2 ** 32 + 5, 1.5, -1.5, 2.5, NaN, Infinity, -0, 1e20, 0.1];
for (const C of [Uint8Array, Float64Array]) {
    const a = new C(values.length);
    for (let i = 0; i < a.length; i++) a[i] = values[i];
    console.log(C.name, list(a));
    console.log(sum(a), sumTo(a, 3), sumTo(a, 2.5), sumTo(a, 100), sumTo(a, NaN), sumTo(a, '4'));
}
