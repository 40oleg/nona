const SCALE = Number(process.env.SCALE) || 1; const S = n => Math.round(n * SCALE);
function add(a, b) { return a + b; }
let t = performance.now();
let s = 0;
for (let i = 0; i < S(10000000); i++) s = add(s, i);
const tCalls = performance.now() - t;
t = performance.now();
const fns = new Array(S(1000000));
for (let i = 0; i < S(1000000); i++) { const k = i; fns[i] = () => k + 1; }
let s2 = 0;
for (let i = 0; i < S(1000000); i++) s2 += fns[i]();
const tClos = performance.now() - t;
t = performance.now();
let s3 = 0;
for (let i = 0; i < S(2000000); i++) { s3 += add.call(null, i, 1); s3 += add.apply(null, [i, 2]); }
const tCallApply = performance.now() - t;
console.log(JSON.stringify({ calls10M: tCalls, closures1M: tClos, callApply4M: tCallApply, check: s + s2 + s3 }));
