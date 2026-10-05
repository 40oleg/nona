const edges = [[1, 2], [0, 2], [0, 1]], colors = [-1, -1, -1];
function color(vertex, budget) {
  if (vertex === edges.length) return true;
  for (let candidate = 0; candidate < budget; candidate++) {
    if (edges[vertex].some(other => colors[other] === candidate)) continue;
    colors[vertex] = candidate;
    if (color(vertex + 1, budget)) return true;
    colors[vertex] = -1;
  }
  return false;
}
let budget = 1; while (!color(0, budget)) budget++;
console.log(budget + ':' + colors.join(','));
