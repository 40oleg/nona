const key = 'ZEBRA', source = 'MEETATTHEPARK';
const width = key.length;
const padded = source.padEnd(Math.ceil(source.length / width) * width, 'X');
const order = Array.from(key, (letter, index) => ({ letter, index })).sort((a, b) => a.letter < b.letter ? -1 : 1);
let encrypted = '';
for (const entry of order) {
  for (let at = entry.index; at < padded.length; at += width) {
    encrypted += padded[at];
  }
}
console.log(JSON.stringify({ order: order.map(entry => entry.index), padded, encrypted }));
