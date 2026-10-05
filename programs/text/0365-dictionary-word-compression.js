const words = 'red blue red green blue red'.split(' ');
const dictionary = [];
const indices = new Map();
const codes = words.map(word => {
  if (!indices.has(word)) {
    indices.set(word, dictionary.length);
    dictionary.push(word);
  }
  return indices.get(word);
});
const restored = codes.map(code => dictionary[code]).join(' ');
console.log(JSON.stringify({ dictionary, codes, restored }));
