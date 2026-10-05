const words = 'one two three one two four'.split(' ');
const fingerprints = [];
for (let i = 0; i + 2 < words.length; i++) {
  const shingle = words.slice(i, i + 3).join(' ');
  let hash = 2166136261;
  for (let j = 0; j < shingle.length; j++) hash = Math.imul(hash ^ shingle.charCodeAt(j), 16777619) >>> 0;
  fingerprints.push([shingle, hash]);
}
const unique = new Set(fingerprints.map(entry => entry[1]));
console.log(JSON.stringify({ fingerprints, unique: unique.size }));
