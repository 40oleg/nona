const dimensions = [5, 10, 3, 12, 5], count = dimensions.length - 1;
const cost = Array.from({length: count}, () => Array(count).fill(0));
const cut = Array.from({length: count}, () => Array(count).fill(-1));
for (let width = 2; width <= count; width++) for (let i = 0; i + width <= count; i++) {
  const j = i + width - 1; cost[i][j] = Infinity;
  for (let k = i; k < j; k++) { const candidate = cost[i][k] + cost[k + 1][j] + dimensions[i] * dimensions[k + 1] * dimensions[j + 1]; if (candidate < cost[i][j]) { cost[i][j] = candidate; cut[i][j] = k; } }
}
function render(i, j) { return i === j ? 'M' + i : '(' + render(i, cut[i][j]) + render(cut[i][j] + 1, j) + ')'; }
console.log(cost[0][count - 1] + ':' + render(0, count - 1));
