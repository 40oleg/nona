const links = [[1, 2], [2], []], n = links.length; let rank = Array(n).fill(1 / n);
for (let iteration = 0; iteration < 8; iteration++) {
  const next = Array(n).fill(0.15 / n);
  links.forEach((targets, page) => { if (!targets.length) for (let p = 0; p < n; p++) next[p] += 0.85 * rank[page] / n; else for (const target of targets) next[target] += 0.85 * rank[page] / targets.length; });
  rank = next;
}
if (Math.abs(rank.reduce((a, b) => a + b, 0) - 1) > 1e-9) throw new Error('rank mass');
console.log(rank.map(x => Math.round(x * 10000)).join(','));
