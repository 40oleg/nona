let remaining = 756; const original = remaining, factors = new Map();
for (let divisor = 2; divisor * divisor <= remaining; divisor++) {
  while (remaining % divisor === 0) { factors.set(divisor, (factors.get(divisor) || 0) + 1); remaining /= divisor; }
}
if (remaining > 1) factors.set(remaining, 1);
let reconstructed = 1; const text = [];
for (const [prime, exponent] of factors) { reconstructed *= prime ** exponent; text.push(prime + '^' + exponent); }
if (reconstructed !== original) throw new Error('factorization');
console.log(text.join('*'));
