function check(code) {
  const digits = code.replace(/-/g, '');
  if (digits.length !== 13) return false;
  let total = 0;
  for (let i = 0; i < 13; i++) total += Number(digits[i]) * (i % 2 ? 3 : 1);
  return total % 10 === 0;
}
const codes = ['978-0-306-40615-7', '9780306406158'];
const results = codes.map(code => ({ code, valid: check(code) }));
console.log(JSON.stringify(results));
