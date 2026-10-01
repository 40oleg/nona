const SCALE = Number(process.env.SCALE) || 1; const S = n => Math.round(n * SCALE);
let t = performance.now();
let keep = null, sum = 0;
for (let i = 0; i < S(5000000); i++) {
  const o = { a: i, b: [i, i + 1], c: { d: i } };
  if (i % 1000 === 0) keep = o;
  sum += o.b[1] - o.c.d;
}
const tAlloc = performance.now() - t;
console.log(JSON.stringify({ alloc5M: tAlloc, check: sum + keep.a }));
