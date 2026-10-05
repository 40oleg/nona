let tokens = Array.from('banana_bandana');
const merges = [];
for (let round = 0; round < 3; round++) {
  const counts = new Map();
  for (let i = 0; i + 1 < tokens.length; i++) { const key = tokens[i] + '|' + tokens[i + 1]; counts.set(key, (counts.get(key) || 0) + 1); }
  const ranked = Array.from(counts).sort((a, b) => b[1] - a[1]);
  const [left, right] = ranked[0][0].split('|');
  const next = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === left && tokens[i + 1] === right) { next.push(left + right); i++; } else next.push(tokens[i]);
  }
  merges.push([left, right]); tokens = next;
}
console.log(JSON.stringify({ merges, tokens }));
