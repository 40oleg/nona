const source = 'ABC';
const bytes = [];
for (const c of source) {
  const code = c.charCodeAt(0);
  let ones = 0;
  for (let bit = 0; bit < 7; bit++) ones += (code >>> bit) & 1;
  bytes.push(code | ((ones % 2) << 7));
}
const parityValid = bytes.every(byte => byte.toString(2).split('1').length % 2 === 1);
console.log(JSON.stringify({ bytes, parityValid }));
