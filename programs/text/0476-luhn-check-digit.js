function checksum(digits) {
  let sum = 0;
  for (let i = digits.length - 1, parity = 0; i >= 0; i--, parity++) {
    let n = Number(digits[i]);
    if (parity % 2) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10;
}
const prefix = '7992739871';
let digit = 0;
while (checksum(prefix + digit) !== 0) digit++;
console.log(JSON.stringify({ complete: prefix + digit, valid: checksum(prefix + digit) === 0 }));
