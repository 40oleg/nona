const symbols = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const results = [];
for (let number of [49, 944, 2026]) {
  let text = '';
  const original = number;
  for (const [value, symbol] of symbols) {
    while (number >= value) { text += symbol; number -= value; }
  }
  results.push([original, text]);
}
console.log(JSON.stringify(results));
