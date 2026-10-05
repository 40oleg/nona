const source = '12 3.5 .25 6e-2 7E+3';
let cursor = 0;
const tokens = [];
function digits() { while (source[cursor] >= '0' && source[cursor] <= '9') cursor++; }
while (cursor < source.length) {
  if (source[cursor] === ' ') { cursor++; continue; }
  const start = cursor;
  digits();
  if (source[cursor] === '.') { cursor++; digits(); }
  if (source[cursor] === 'e' || source[cursor] === 'E') { cursor++; if (source[cursor] === '+' || source[cursor] === '-') cursor++; digits(); }
  tokens.push([source.slice(start, cursor), Number(source.slice(start, cursor))]);
}
console.log(JSON.stringify(tokens));
