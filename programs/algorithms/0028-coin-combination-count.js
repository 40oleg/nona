const ways = new Uint32Array(9); ways[0] = 1;
const denominations = [2, 3, 5];
for (const coin of denominations) {
  for (let value = coin; value < ways.length; value++) ways[value] += ways[value - coin];
}
if (ways[0] !== 1 || ways[1] !== 0 || ways[8] !== 3) throw new Error('combinations');
console.log(Array.from(ways).join(','));
