let seed = 12345; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const o = {}; const log = [];
for (let step = 0; step < 400; step++) {
  const k = 'k' + rnd(120), op = rnd(10);
  if (op < 4) o[k] = step;
  else if (op < 7) log.push(delete o[k] ? 1 : 0);
  else if (op < 8) Object.defineProperty(o, k, {get() { return 'g' + step; }, configurable: true, enumerable: rnd(2) === 0});
  else if (op < 9) log.push(k in o ? 1 : 0);
  else { const n = rnd(1000); o[n] = n; if (rnd(2)) delete o[n]; }
  if (step % 100 === 0) console.log(step, Object.keys(o).join(','));
}
console.log(log.join(''));
console.log(Object.getOwnPropertyNames(o).join(','));
let s = ''; for (const k in o) s += k + '=' + o[k] + ';'; console.log(s);
const q = {}; for (let i = 0; i < 150; i++) q['p' + i] = i; for (let i = 0; i < 150; i += 2) delete q['p' + i];
for (let i = 0; i < 150; i += 3) q['p' + i] = -i; console.log(Object.keys(q).length, Object.keys(q).slice(0, 20).join(), Object.keys(q).slice(-20).join());
for (let i = 149; i >= 0; i--) delete q['p' + i]; console.log(Object.keys(q).length); q.z = 1; console.log(JSON.stringify(q));
const sealed = {}; for (let i = 0; i < 50; i++) sealed['s' + i] = i; Object.seal(sealed); console.log(delete sealed.s3, 's3' in sealed);
