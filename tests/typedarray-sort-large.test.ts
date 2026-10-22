import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// %TypedArray%.prototype.sort / toSorted are O(n log n) (#453), compared with
// Node.js.
const programs = (n: number): Record<string, string> => ({
    "large Float64Array with NaN and negative zero": `
let s = 12345;
const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648);
const n = ${n};
const f = new Float64Array(n);
for (let i = 0; i < n; i++) {
    const r = rnd() % 1000;
    f[i] = r === 0 ? NaN : r === 1 ? -0 : r === 2 ? 0 : r - 500;
}
const t = f.toSorted();
f.sort();
let sum = 0, nan = 0, negZero = 0, posZero = 0, ordered = true;
for (let i = 0; i < n; i++) {
    if (f[i] !== t[i] && !(f[i] !== f[i] && t[i] !== t[i])) ordered = false;
    if (Object.is(f[i], t[i]) === false) ordered = false;
    if (f[i] !== f[i]) nan++;
    else {
        sum += f[i] * (i % 7);
        if (Object.is(f[i], -0)) negZero++;
        if (Object.is(f[i], 0)) posZero++;
    }
}
let firstNaN = f.findIndex(v => v !== v);
let firstZero = f.findIndex(v => v === 0);
console.log(ordered, sum, nan, negZero, posZero, firstNaN, firstZero, Object.is(f[firstZero], -0), Object.is(f[firstZero + negZero], 0), f[0], f[n - nan - 1]);
`,
    "Int32Array with comparators": `
let s = 99;
const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648);
const n = ${n};
const a = new Int32Array(n);
for (let i = 0; i < n; i++) a[i] = (rnd() % 2000) - 1000;
const d = a.toSorted((x, y) => y - x);
let ok = true;
for (let i = 1; i < n; i++) if (d[i - 1] < d[i]) ok = false;
// Stability: order by (value % 10) only, ties must keep the index order.
const idx = new Int32Array(n);
for (let i = 0; i < n; i++) idx[i] = i;
idx.sort((x, y) => (a[x] % 10) - (a[y] % 10));
let stable = true;
for (let i = 1; i < n; i++) {
    const p = a[idx[i - 1]] % 10, q = a[idx[i]] % 10;
    if (p > q || (p === q && idx[i - 1] > idx[i])) stable = false;
}
let sum = 0;
for (let i = 0; i < n; i += 13) sum += d[i] + idx[i];
console.log(ok, stable, sum, d[0], d[n - 1], a.toSorted()[0], a.toSorted()[n - 1]);
`,
});
// 100,000 elements without GC stress (a collection per allocation is too slow
// for that size); a smaller list, past the insertion-sort cutoff, with it.
for (const [n, gcStress] of [
    [100000, false],
    [100, true],
] as const)
    for (const [name, source] of Object.entries(programs(n)))
        test(`TypedArray sort: ${name} (${n})`, () => {
            const expected = runOracle(source).stdout;
            const run = runOnHost(source, { gcStress });
            assert.equal(run.error, undefined);
            assert.equal(run.status, 0, run.stderr);
            assert.equal(run.stdout, expected);
        });
