const roads = new Map([['A', [['B', 7], ['C', 2]]], ['C', [['B', 1], ['D', 8]]], ['B', [['D', 3]]], ['D', []]]);
const distance = new Map([['A', 0]]), pending = new Set(roads.keys());
while (pending.size) {
  let best, cost = Infinity;
  for (const node of pending) if ((distance.get(node) ?? Infinity) < cost) { best = node; cost = distance.get(node); }
  if (best === undefined) break;
  pending.delete(best);
  for (const [to, weight] of roads.get(best)) if (cost + weight < (distance.get(to) ?? Infinity)) distance.set(to, cost + weight);
}
if (distance.get('D') !== 6) throw new Error('route');
console.log(JSON.stringify([...distance]));
