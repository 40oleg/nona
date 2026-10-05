const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encoded = 'SGVsbG8h';
const bytes = [];
let reservoir = 0, bits = 0;
for (const character of encoded) {
  if (character === '=') break;
  reservoir = (reservoir << 6) | alphabet.indexOf(character);
  bits += 6;
  if (bits >= 8) { bits -= 8; bytes.push((reservoir >>> bits) & 255); }
}
console.log(JSON.stringify({ bytes, text: bytes.map(n => String.fromCharCode(n)).join('') }));
