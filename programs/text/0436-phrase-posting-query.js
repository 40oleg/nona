const words = 'a red fox sees a red bird and a red fox'.split(' ');
const positions = new Map();
words.forEach((word, at) => { if (!positions.has(word)) positions.set(word, []); positions.get(word).push(at); });
const phrase = ['red', 'fox'];
const hits = [];
for (const start of positions.get(phrase[0]) || []) {
  let valid = true;
  for (let i = 1; i < phrase.length; i++) if (!(positions.get(phrase[i]) || []).includes(start + i)) valid = false;
  if (valid) hits.push(start);
}
console.log(JSON.stringify(hits));
