let base = 123456789n, exponent = 37n;
const modulus = 1000000007n; let product = 1n;
base %= modulus;
while (exponent > 0n) {
  if (exponent & 1n) product = product * base % modulus;
  base = base * base % modulus;
  exponent >>= 1n;
}
if (product < 0n || product >= modulus) throw new Error('residue');
console.log(String(product));
