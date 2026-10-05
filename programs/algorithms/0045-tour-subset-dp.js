const cost = [[0, 2, 9, 7], [2, 0, 4, 3], [9, 4, 0, 1], [7, 3, 1, 0]];
const dp = new Map([['1:0', 0]]);
for (let mask = 1; mask < 16; mask++) for (let end = 0; end < 4; end++) {
  const current = dp.get(mask + ':' + end); if (current === undefined) continue;
  for (let next = 1; next < 4; next++) if (!(mask & (1 << next))) {
    const key = (mask | (1 << next)) + ':' + next;
    dp.set(key, Math.min(dp.get(key) ?? Infinity, current + cost[end][next]));
  }
}
let best = Infinity;
for (let end = 1; end < 4; end++) best = Math.min(best, dp.get('15:' + end) + cost[end][0]);
console.log(best);
