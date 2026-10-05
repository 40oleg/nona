const transition = [[0.8, 0.2], [0.3, 0.7]]; let distribution = [1, 0];
for (let step = 0; step < 5; step++) {
  const next = [0, 0];
  distribution.forEach((mass, from) => transition[from].forEach((chance, to) => { next[to] += mass * chance; }));
  if (Math.abs(next.reduce((a, b) => a + b, 0) - 1) > 1e-12) throw new Error('probability mass');
  distribution = next;
}
console.log(distribution.map(x => Math.round(x * 100000)).join(','));
