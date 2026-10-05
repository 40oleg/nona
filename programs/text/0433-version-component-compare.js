function compare(left, right) {
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
const pairs = [['1.2', '1.2.0'], ['1.9', '1.10'], ['2.0', '1.99']];
console.log(JSON.stringify(pairs.map(([a, b]) => compare(a, b))));
