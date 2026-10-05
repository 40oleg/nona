function choose(n, k) { if (k < 0 || k > n) return 0; let result = 1; for (let i = 1; i <= k; i++) result = result * (n - k + i) / i; return result; }
const n = 6, k = 3; let rank = 12, start = 0; const subset = [];
for (let remaining = k; remaining > 0; remaining--) {
  for (let candidate = start; candidate < n; candidate++) {
    const block = choose(n - candidate - 1, remaining - 1);
    if (rank >= block) rank -= block;
    else { subset.push(candidate); start = candidate + 1; break; }
  }
}
if (subset.length !== k || rank !== 0) throw new Error('unranking');
console.log(subset.join(','));
