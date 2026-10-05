const input = 'a\tbcd\te\nxy\tz';
let column = 0, output = '';
const widths = [];
for (const c of input) {
  if (c === '\t') { const count = 4 - column % 4; output += ' '.repeat(count); column += count; }
  else if (c === '\n') { widths.push(column); output += c; column = 0; }
  else { output += c; column++; }
}
widths.push(column);
console.log(JSON.stringify({ output, widths }));
