const square = 'ABCDEFGHIKLMNOPQRSTUVWXYZ';
const text = 'JIG SAW';
const codes = [];
for (const c of text.replace(/J/g, 'I')) {
  if (c === ' ') { codes.push('/'); continue; }
  const index = square.indexOf(c);
  codes.push(String(Math.floor(index / 5) + 1) + String(index % 5 + 1));
}
const restored = codes.map(code => code === '/' ? ' ' : square[(Number(code[0]) - 1) * 5 + Number(code[1]) - 1]).join('');
console.log(JSON.stringify({ codes, restored }));
