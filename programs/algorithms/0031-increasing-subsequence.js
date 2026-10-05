const readings = [5, 2, 2, 8, 3, 4], tails = [];
for (const value of readings) {
  let lo = 0, hi = tails.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < value) lo = mid + 1; else hi = mid; }
  tails[lo] = value;
}
if (tails.length !== 3) throw new Error('strict increase');
console.log(tails.length + ':' + tails.join(','));
