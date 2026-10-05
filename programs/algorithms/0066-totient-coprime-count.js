const n = 36; let remainder = n; const divisors = new Set();
for (let d = 2; d * d <= remainder; d++) {
  if (remainder % d) continue;
  divisors.add(d); while (remainder % d === 0) remainder /= d;
}
if (remainder > 1) divisors.add(remainder);
let phi = n;
for (const prime of divisors) phi -= phi / prime;
console.log(phi + ':' + [...divisors].join(','));
