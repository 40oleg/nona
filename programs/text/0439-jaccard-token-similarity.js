const a = new Set('the quick brown fox'.split(' '));
const b = new Set('a quick red fox'.split(' '));
const intersection = [];
for (const word of a) {
  if (b.has(word)) intersection.push(word);
}
const union = new Set([...a, ...b]);
const similarity = intersection.length / union.size;
const onlyA = Array.from(a).filter(word => !b.has(word));
const onlyB = Array.from(b).filter(word => !a.has(word));
console.log(JSON.stringify({ intersection, onlyA, onlyB, similarity }));
