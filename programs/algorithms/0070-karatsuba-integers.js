function multiply(a, b) {
  if (a < 10n || b < 10n) return a * b;
  const width = Math.floor(Math.max(String(a).length, String(b).length) / 2);
  const base = 10n ** BigInt(width);
  const ah = a / base, al = a % base, bh = b / base, bl = b % base;
  const high = multiply(ah, bh), low = multiply(al, bl);
  const middle = multiply(ah + al, bh + bl) - high - low;
  return high * base * base + middle * base + low;
}
const a = 12345678n, b = 87654321n, result = multiply(a, b);
if (result !== a * b) throw new Error('split product');
console.log(String(result));
