let value = -17; const input = value, digits = [];
while (value !== 0) {
  let remainder = ((value % 3) + 3) % 3;
  if (remainder === 2) remainder = -1;
  digits.unshift(remainder); value = (value - remainder) / 3;
}
const restored = digits.reduce((sum, digit) => sum * 3 + digit, 0);
if (restored !== input) throw new Error('balanced representation');
console.log(digits.map(d => d === -1 ? 'T' : String(d)).join(''));
