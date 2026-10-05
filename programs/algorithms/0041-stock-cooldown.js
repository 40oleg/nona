let holding = -Infinity, sold = -Infinity, resting = 0;
const prices = [1, 2, 3, 0, 2]; const trace = [];
for (const price of prices) {
  const [oldHolding, oldSold, oldResting] = [holding, sold, resting];
  holding = Math.max(oldHolding, oldResting - price);
  sold = oldHolding + price;
  resting = Math.max(oldResting, oldSold);
  trace.push(Math.max(sold, resting));
}
console.log(Math.max(sold, resting) + ':' + trace.join(','));
