function summarize(points) {
  let n = 0, x = 0, y = 0, c = 0;
  for (const [px, py] of points) { n++; const dx = px - x; x += dx / n; y += (py - y) / n; c += dx * (py - y); }
  return {n, x, y, c};
}
const a = summarize([[1, 2], [2, 4]]), b = summarize([[3, 5], [4, 8]]), n = a.n + b.n;
const covariance = (a.c + b.c + (b.x - a.x) * (b.y - a.y) * a.n * b.n / n) / n;
const direct = summarize([[1, 2], [2, 4], [3, 5], [4, 8]]);
if (Math.abs(covariance - direct.c / direct.n) > 1e-9) throw new Error('merge');
console.log(covariance);
