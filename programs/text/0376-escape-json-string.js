const source = 'a"b\\c\n\t\u0001';
const simple = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\t': '\\t' };
let escaped = '"';
for (const character of source) {
  if (character in simple) escaped += simple[character];
  else if (character.charCodeAt(0) < 32) escaped += '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0');
  else escaped += character;
}
escaped += '"';
console.log(JSON.stringify({ escaped, roundtrip: JSON.parse(escaped) === source }));
