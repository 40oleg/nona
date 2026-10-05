async function main() {
  const graph = new Map([['a', [['b', 5], ['c', 2]]], ['b', [['d', 1]]], ['c', [['b', 1], ['d', 7]]], ['d', []]]);
  const costs = new Map([['a', 0]]);
  const visited = new Set();
  while (visited.size < graph.size) {
    const candidates = Array.from(costs).filter(([key]) => !visited.has(key)).sort((a, b) => a[1] - b[1]);
    if (!candidates.length) break;
    const [key, distance] = candidates[0]; visited.add(key);
    for (const [next, raw] of graph.get(key)) {
      const cost = distance + await Promise.resolve(raw);
      if (!costs.has(next) || cost < costs.get(next)) costs.set(next, cost);
    }
  }
  console.log(JSON.stringify(Array.from(costs)));
}
main().catch(error => { throw error; });
