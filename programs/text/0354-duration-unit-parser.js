const input = '2h15m30s';
const scales = { h: 3600, m: 60, s: 1 };
let digits = '', seconds = 0;
const pieces = [];
for (const c of input) {
  if (c >= '0' && c <= '9') digits += c;
  else {
    const value = Number(digits) * scales[c];
    seconds += value; pieces.push(value); digits = '';
  }
}
console.log(JSON.stringify({ seconds, pieces }));
