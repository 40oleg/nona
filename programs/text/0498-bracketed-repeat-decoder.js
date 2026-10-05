const encoded = '2[a3[b]]c';
const stack = [];
let current = '', number = '';
for (const c of encoded) {
  if (c >= '0' && c <= '9') number += c;
  else if (c === '[') { stack.push([current, Number(number)]); current = ''; number = ''; }
  else if (c === ']') { const [prefix, times] = stack.pop(); current = prefix + current.repeat(times); }
  else current += c;
}
const balanced = stack.length === 0;
console.log(JSON.stringify({ decoded: current, balanced }));
