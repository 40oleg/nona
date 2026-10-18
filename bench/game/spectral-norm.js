// spectral-norm from the Computer Language Benchmarks Game, written for this
// repository after the problem description (power method on the infinite
// matrix A, 10 iterations). N from the environment (default 1000; the game
// runs N = 5 500).
"use strict";
const n = Number(process.env.N) || 1000;
const A = (i, j) => 1 / (((i + j) * (i + j + 1)) / 2 + i + 1);
function timesA(v, out, transposed) {
    for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++)
            sum += (transposed ? A(j, i) : A(i, j)) * v[j];
        out[i] = sum;
    }
}
function timesAtA(v, out, temp) {
    timesA(v, temp, false);
    timesA(temp, out, true);
}
const u = new Float64Array(n).fill(1),
    v = new Float64Array(n),
    temp = new Float64Array(n);
for (let i = 0; i < 10; i++) {
    timesAtA(u, v, temp);
    timesAtA(v, u, temp);
}
let vBv = 0,
    vv = 0;
for (let i = 0; i < n; i++) {
    vBv += u[i] * v[i];
    vv += v[i] * v[i];
}
console.log(Math.sqrt(vBv / vv).toFixed(9));
