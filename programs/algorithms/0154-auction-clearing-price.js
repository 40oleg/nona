const bids = [10, 8, 8, 5], asks = [3, 6, 8, 11];
const candidates = [...new Set([...bids, ...asks])].sort((a, b) => a - b);
let best = {price: 0, trades: -1, imbalance: Infinity};
for (const price of candidates) {
  const buyers = bids.filter(b => b >= price).length, sellers = asks.filter(a => a <= price).length;
  const trades = Math.min(buyers, sellers), imbalance = Math.abs(buyers - sellers);
  if (trades > best.trades || trades === best.trades && imbalance < best.imbalance) best = {price, trades, imbalance};
}
console.log(best.price + ':' + best.trades + ':' + best.imbalance);
