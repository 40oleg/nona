const words = ['listen', 'silent', 'stone', 'tones', 'enlist', 'apple'];
const groups = new Map();
for (const word of words) {
  const signature = Array.from(word.toLowerCase()).sort().join('');
  if (!groups.has(signature)) groups.set(signature, []);
  groups.get(signature).push(word);
}
const repeated = Array.from(groups.values()).filter(group => group.length > 1);
const singles = Array.from(groups.values()).filter(group => group.length === 1).flat();
console.log(JSON.stringify({ repeated, singles }));
