const coins = [1, 3, 4], amount = 6;
const minimum = Array(amount + 1).fill(Infinity), last = Array(amount + 1).fill(0); minimum[0] = 0;
for (let sum = 1; sum <= amount; sum++) {
  for (const coin of coins) if (coin <= sum && minimum[sum - coin] + 1 < minimum[sum]) { minimum[sum] = minimum[sum - coin] + 1; last[sum] = coin; }
}
const payment = [];
for (let remaining = amount; remaining > 0; remaining -= last[remaining]) payment.push(last[remaining]);
if (payment.reduce((a, b) => a + b, 0) !== amount) throw new Error('payment');
console.log(minimum[amount] + ':' + payment.join('+'));
