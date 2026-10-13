// Typed array block operations (fill, copyWithin, set, slice and searches)
// and element-wise numeric loops over typed arrays. The SIMD work (#253)
// measures its typed array kernels with this script; the loops are the
// baseline for compiled code over typed arrays.
const SCALE = Number(process.env.SCALE) || 1;
const S = (n) => Math.max(1, Math.round(n * SCALE));

const N = 1 << 16;
const bytes = new Uint8Array(N);
const ints = new Int32Array(N);
const doubles = new Float64Array(N);
for (let i = 0; i < N; i++) {
    bytes[i] = (i * 7) & 255;
    ints[i] = (i * 2654435761) | 0;
    doubles[i] = i * 0.5;
}
let check = 0;

let t = performance.now();
for (let round = 0; round < S(400); round++) {
    bytes.fill(round & 255, 16, N - 16);
    ints.fill(round, 3);
    doubles.fill(round + 0.25, 0, N >> 1);
    check += bytes[100] + ints[N - 1] + doubles[7];
}
const tFill = performance.now() - t;

t = performance.now();
const target = new Int32Array(N);
for (let round = 0; round < S(400); round++) {
    target.set(ints);
    ints.copyWithin(1, 0, N - 1);
    bytes.copyWithin(0, 1);
    check += target[5] + ints[9] + bytes[N >> 1];
    check += doubles.slice(round, round + 4096).length;
}
const tCopy = performance.now() - t;

t = performance.now();
bytes.fill(1);
ints.fill(-5);
doubles.fill(2.5);
for (let round = 0; round < S(200); round++) {
    check += bytes.indexOf(2) + bytes.lastIndexOf(0);
    check += ints.indexOf(7) + (ints.includes(-6) ? 1 : 0);
    check += doubles.indexOf(3) + (doubles.includes(NaN) ? 1 : 0);
}
const tSearch = performance.now() - t;

t = performance.now();
const x = new Float64Array(4096),
    y = new Float64Array(4096);
for (let i = 0; i < 4096; i++) {
    x[i] = i % 17;
    y[i] = i % 5;
}
for (let round = 0; round < S(400); round++) {
    for (let i = 0; i < 4096; i++) y[i] = y[i] * 0.5 + x[i];
    let sum = 0;
    for (let i = 0; i < 4096; i++) sum += ints[i] & 15;
    check += y[round] + sum;
}
const tLoops = performance.now() - t;

console.log(
    JSON.stringify({
        fill: tFill,
        copy: tCopy,
        search: tSearch,
        loops: tLoops,
        check,
    }),
);
