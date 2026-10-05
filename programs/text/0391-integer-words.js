const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function spell(n) {
  if (n < 20) return small[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + spell(n % 10) : '');
  return small[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + spell(n % 100) : '');
}
const results = [];
for (const value of [0, 19, 42, 100, 305, 999]) results.push([value, spell(value)]);
console.log(JSON.stringify(results));
