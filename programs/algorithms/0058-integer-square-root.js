const n = 1234567890123456789n;
let low = 0n, high = n + 1n;
while (low + 1n < high) {
  const middle = (low + high) / 2n;
  if (middle <= n / middle) low = middle; else high = middle;
}
if (low * low > n || (low + 1n) * (low + 1n) <= n) throw new Error('root bound');
console.log(String(low));
