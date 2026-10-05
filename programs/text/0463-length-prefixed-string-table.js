const values = ['red', '', 'a:2|b'];
const encoded = values.map(value => value.length + ':' + value).join('');
const decoded = [];
let cursor = 0;
while (cursor < encoded.length) {
  const colon = encoded.indexOf(':', cursor);
  const length = Number(encoded.slice(cursor, colon));
  cursor = colon + 1;
  decoded.push(encoded.slice(cursor, cursor + length));
  cursor += length;
}
console.log(JSON.stringify({ encoded, decoded }));
