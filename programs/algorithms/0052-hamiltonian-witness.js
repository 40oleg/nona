const graph = [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]];
const path = [0], used = new Set([0]);
function extend(vertex) {
  if (path.length === graph.length) return true;
  for (const next of graph[vertex]) {
    if (used.has(next)) continue;
    used.add(next); path.push(next);
    if (extend(next)) return true;
    used.delete(next); path.pop();
  }
  return false;
}
console.log(extend(0) ? path.join('>') : 'blocked');
