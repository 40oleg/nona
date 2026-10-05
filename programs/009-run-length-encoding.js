// Encode runs, serialize their records as JSON, then decode with destructuring.
function encode(text) {
  const runs = [];
  for (let i = 0; i < text.length;) {
    const character = text[i];
    let count = 0;
    while (i < text.length && text[i] === character) { count++; i++; }
    runs.push({character: character, count: count});
  }
  return runs;
}
function decode(runs) {
  let text = '';
  for (let i = 0; i < runs.length; i++) {
    const {character, count} = runs[i];
    for (let j = 0; j < count; j++) text += character;
  }
  return text;
}

const original = 'aaabbcaaaa';
const runs = JSON.parse(JSON.stringify(encode(original)));
const labels = [];
for (let i = 0; i < runs.length; i++) labels.push(runs[i].character + ':' + runs[i].count);
const restored = decode(runs);
console.log(labels.join('|'));
console.log(restored === original, restored.length);
console.log(encode('').length, decode([]).length);
