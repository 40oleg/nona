const SCALE = Number(process.env.SCALE) || 1; const S = n => Math.round(n * SCALE);
const t0 = performance.now();
let p = Promise.resolve(0);
for (let i = 0; i < S(1000000); i++) p = p.then(v => v + 1);
p.then(v => {
  const tProm = performance.now() - t0;
  const t1 = performance.now();
  let n = 0;
  function tick() { if (++n < S(10000)) setTimeout(tick, 0); else { const tTimer = performance.now() - t1; console.log(JSON.stringify({ promise1M: tProm, timeout10k: tTimer, check: v + n })); } }
  setTimeout(tick, 0);
});
