const payouts = [4, 1, 2, 7, 5];
function linear(values) {
  let include = 0, exclude = 0;
  for (const value of values) [include, exclude] = [exclude + value, Math.max(include, exclude)];
  return Math.max(include, exclude);
}
const best = Math.max(linear(payouts.slice(1)), linear(payouts.slice(0, -1)));
if (best !== 11) throw new Error('circular adjacency');
console.log(best);
