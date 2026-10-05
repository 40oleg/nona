const source = 'aaabbcdddd';
const counts = new Map();
for (const c of source) counts.set(c, (counts.get(c) || 0) + 1);
let entropy = 0;
const probabilities = [];
for (const [symbol, count] of counts) {
  const probability = count / source.length;
  entropy -= probability * Math.log2(probability);
  probabilities.push([symbol, probability]);
}
console.log(JSON.stringify({ probabilities, entropy: Number(entropy.toFixed(6)) }));
