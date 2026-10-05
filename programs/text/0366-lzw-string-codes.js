const input = 'ABABABAAB';
const dictionary = new Map([['A', 0], ['B', 1]]);
const codes = [];
let phrase = '';
for (const character of input) {
  const next = phrase + character;
  if (dictionary.has(next)) phrase = next;
  else { codes.push(dictionary.get(phrase)); dictionary.set(next, dictionary.size); phrase = character; }
}
if (phrase) codes.push(dictionary.get(phrase));
console.log(JSON.stringify({ codes, dictionary: Array.from(dictionary) }));
