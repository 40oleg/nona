let a = 84, b = 33, x0 = 1, x1 = 0, y0 = 0, y1 = 1;
const original = [a, b];
while (b) {
  const quotient = Math.floor(a / b);
  [a, b] = [b, a - quotient * b];
  [x0, x1] = [x1, x0 - quotient * x1];
  [y0, y1] = [y1, y0 - quotient * y1];
}
if (original[0] * x0 + original[1] * y0 !== a) throw new Error('certificate');
console.log([a, x0, y0].join(','));
