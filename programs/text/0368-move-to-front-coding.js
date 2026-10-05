const alphabet = ['a', 'b', 'c', 'd'];
const text = 'cabacada';
const encoded = [];
for (const character of text) {
  const at = alphabet.indexOf(character);
  encoded.push(at);
  alphabet.splice(at, 1);
  alphabet.unshift(character);
}
console.log(JSON.stringify({ encoded, finalAlphabet: alphabet.join('') }));
