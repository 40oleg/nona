const stream = 'loading 10%\rready\b!';
const cells = [];
let cursor = 0;
for (const character of stream) {
  if (character === '\r') cursor = 0;
  else if (character === '\b') cursor = Math.max(0, cursor - 1);
  else { cells[cursor] = character; cursor++; }
}
const visible = cells.join('');
console.log(JSON.stringify({ visible, cursor }));
