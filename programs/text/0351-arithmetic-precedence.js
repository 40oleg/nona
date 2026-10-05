const source = '2*(3+4)+5*6';
let cursor = 0;
function atom() {
  if (source[cursor] === '(') { cursor++; const n = sum(); cursor++; return n; }
  let digits = '';
  while (cursor < source.length && source[cursor] >= '0' && source[cursor] <= '9') digits += source[cursor++];
  return Number(digits);
}
function product() { let n = atom(); while (source[cursor] === '*') { cursor++; n *= atom(); } return n; }
function sum() { let n = product(); while (source[cursor] === '+') { cursor++; n += product(); } return n; }
const result = sum();
console.log(JSON.stringify({ result, consumed: cursor }));
