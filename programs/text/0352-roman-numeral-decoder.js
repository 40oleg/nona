const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
const inputs = ['XIV', 'MCMXC', 'XLII'];
const results = [];
for (const input of inputs) {
  let total = 0;
  for (let i = 0; i < input.length; i++) {
    const current = values[input[i]];
    const next = values[input[i + 1]] || 0;
    total += current < next ? -current : current;
  }
  results.push([input, total]);
}
console.log(JSON.stringify(results));
