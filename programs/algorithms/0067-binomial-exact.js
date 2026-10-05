const n = 60, k = 6; let answer = 1n;
for (let i = 1; i <= k; i++) {
  const numerator = answer * BigInt(n - k + i), denominator = BigInt(i);
  if (numerator % denominator !== 0n) throw new Error('nonintegral combination');
  answer = numerator / denominator;
}
console.log(String(answer));
