const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const bytes = [77, 97, 110, 33];
let encoded = '';
for (let i = 0; i < bytes.length; i += 3) {
  const word = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
  encoded += alphabet[(word >>> 18) & 63];
  encoded += alphabet[(word >>> 12) & 63];
  encoded += i + 1 < bytes.length ? alphabet[(word >>> 6) & 63] : '=';
  encoded += i + 2 < bytes.length ? alphabet[word & 63] : '=';
}
console.log(encoded);
