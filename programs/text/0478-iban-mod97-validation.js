function validate(iban) {
  const compact = iban.replace(/ /g, '').toUpperCase();
  const rotated = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const c of rotated) {
    const digits = c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
console.log(JSON.stringify(['GB82 WEST 1234 5698 7654 32', 'GB83 WEST 1234 5698 7654 32'].map(validate)));
