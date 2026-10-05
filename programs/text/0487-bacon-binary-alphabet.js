const text = 'CODE';
const blocks = [];
for (const letter of text) {
  const value = letter.charCodeAt(0) - 65;
  let block = '';
  for (let bit = 4; bit >= 0; bit--) block += value & (1 << bit) ? 'B' : 'A';
  blocks.push(block);
}
const recovered = blocks.map(block => String.fromCharCode(65 + parseInt(block.replace(/A/g, '0').replace(/B/g, '1'), 2))).join('');
console.log(JSON.stringify({ blocks, recovered }));
