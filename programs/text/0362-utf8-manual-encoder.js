const text = 'AΩ😀';
const bytes = [];
for (const symbol of text) {
  const cp = symbol.codePointAt(0);
  if (cp < 128) bytes.push(cp);
  else if (cp < 2048) bytes.push(192 | (cp >> 6), 128 | (cp & 63));
  else if (cp < 65536) bytes.push(224 | (cp >> 12), 128 | ((cp >> 6) & 63), 128 | (cp & 63));
  else bytes.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63));
}
console.log(JSON.stringify(bytes));
