const key = 'LEMON';
function transform(text, direction) {
  let result = '', position = 0;
  for (const c of text) {
    const code = c.charCodeAt(0) - 65;
    if (code < 0 || code >= 26) { result += c; continue; }
    const shift = key.charCodeAt(position++ % key.length) - 65;
    result += String.fromCharCode(65 + (code + direction * shift + 26) % 26);
  }
  return result;
}
const encrypted = transform('ATTACK AT DAWN', 1);
console.log(JSON.stringify({ encrypted, restored: transform(encrypted, -1) }));
