// Breadth-first search combines a queue, Map, Set and nullish fallback.
const graph = {A: ['B', 'C'], B: ['A', 'D'], C: ['A', 'E'],
  D: ['B', 'F'], E: ['C', 'F'], F: ['D', 'E']};
const queue = ['A'];
const distance = new Map([['A', 0]]);
const visited = new Set(['A']);
const parent = new Map();
for (let head = 0; head < queue.length; head++) {
  const node = queue[head];
  for (const next of graph[node]) {
    if (visited.has(next)) continue;
    visited.add(next);
    distance.set(next, distance.get(node) + 1);
    parent.set(next, node);
    queue.push(next);
  }
}

const path = [];
let current = 'F';
while (current !== undefined) { path.push(current); current = parent.get(current); }
console.log(path.reverse().join(','));
console.log(distance.get('A'), distance.get('F'), distance.get('Z') ?? -1);
