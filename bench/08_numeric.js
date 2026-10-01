const SCALE = Number(process.env.SCALE) || 1; const S = n => Math.round(n * SCALE);
function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
let t = performance.now();
const f = fib(32);
const tFib = performance.now() - t;
t = performance.now();
const N = 200;
const A = [], B = [], C = [];
for (let i = 0; i < N; i++) { A.push(new Array(N)); B.push(new Array(N)); C.push(new Array(N)); for (let j = 0; j < N; j++) { A[i][j] = i + j; B[i][j] = i - j; C[i][j] = 0; } }
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { let acc = 0; for (let k = 0; k < N; k++) acc += A[i][k] * B[k][j]; C[i][j] = acc; }
const tMat = performance.now() - t;
t = performance.now();
let big = 1n;
for (let i = 1n; i <= BigInt(S(3000)); i++) big *= i;
const tBig = performance.now() - t;
console.log(JSON.stringify({ fib32: tFib, matmul200: tMat, bigfact3000: tBig, check: f + C[10][10] + big.toString().length }));
