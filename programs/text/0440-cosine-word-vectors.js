function vector(text) {
  const counts = new Map();
  for (const word of text.split(' ')) counts.set(word, (counts.get(word) || 0) + 1);
  return counts;
}
const a = vector('red red blue'), b = vector('red blue blue green');
let dot = 0, aa = 0, bb = 0;
for (const [word, count] of a) { dot += count * (b.get(word) || 0); aa += count * count; }
for (const count of b.values()) bb += count * count;
const similarity = Number((dot / Math.sqrt(aa * bb)).toFixed(6));
console.log(JSON.stringify({ dot, similarity }));
