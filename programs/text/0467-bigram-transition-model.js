const words = 'red fox red bird red fox blue bird'.split(' ');
const transitions = new Map();
for (let i = 0; i + 1 < words.length; i++) {
  if (!transitions.has(words[i])) transitions.set(words[i], new Map());
  const next = transitions.get(words[i]); next.set(words[i + 1], (next.get(words[i + 1]) || 0) + 1);
}
const model = [];
for (const [word, next] of transitions) {
  const total = Array.from(next.values()).reduce((sum, n) => sum + n, 0);
  model.push([word, Array.from(next, ([target, count]) => [target, count / total])]);
}
console.log(JSON.stringify(model));
