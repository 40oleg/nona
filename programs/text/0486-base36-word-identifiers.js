const words = ['alpha', 'beta', 'gamma'];
const identifiers = words.map((word, index) => ((index + 1) * 256 + word.length).toString(36));
const decoded = [];
for (const id of identifiers) {
  const value = parseInt(id, 36);
  const position = Math.floor(value / 256) - 1;
  const length = value % 256;
  decoded.push({ id, position, length, word: words[position] });
}
console.log(JSON.stringify(decoded));
