const edges = [[0, 1, 4], [0, 2, 5], [1, 2, -2], [2, 3, 3]];
const costs = new Float64Array(5); costs.fill(Infinity); costs[0] = 0;
for (let pass = 1; pass < costs.length; pass++) {
  let changed = false;
  for (const [from, to, weight] of edges) {
    if (costs[from] + weight < costs[to]) { costs[to] = costs[from] + weight; changed = true; }
  }
  if (!changed) break;
}
if (costs[3] !== 5 || costs[4] !== Infinity) throw new Error('relaxation');
console.log(Array.from(costs, x => x === Infinity ? 'unreachable' : x).join(','));
