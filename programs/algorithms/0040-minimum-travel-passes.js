const travel = new Set([1, 2, 4, 7, 8, 9]); const cost = [0];
const offers = [[1, 3], [3, 6], [7, 10]];
for (let day = 1; day <= 9; day++) {
  if (!travel.has(day)) { cost[day] = cost[day - 1]; continue; }
  let cheapest = Infinity;
  for (const [duration, price] of offers) cheapest = Math.min(cheapest, price + cost[Math.max(0, day - duration)]);
  cost[day] = cheapest;
}
if (cost[9] > travel.size * 3) throw new Error('ticket dominance');
console.log(cost.join(','));
