async function main() {
  function gcd(a, b) { while (b) { const remainder = a % b; a = b; b = remainder; } return a; }
  const normalized = [];
  for (const fraction of [[8, 12], [15, 20], [21, 7]]) {
    const [numerator, denominator] = await Promise.resolve(fraction);
    if (denominator === 0) throw new Error('zero denominator');
    const divisor = gcd(numerator, denominator);
    normalized.push([numerator / divisor, denominator / divisor]);
  }
  console.log(JSON.stringify(normalized));
}
main().catch(error => { throw error; });
