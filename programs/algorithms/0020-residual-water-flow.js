const residual = [[0, 3, 2, 0], [0, 0, 1, 2], [0, 0, 0, 3], [0, 0, 0, 0]];
let total = 0;
while (true) {
  const parent = new Int32Array(4); parent.fill(-1); parent[0] = 0; const queue = [0];
  for (let h = 0; h < queue.length; h++) for (let v = 0; v < 4; v++) if (parent[v] < 0 && residual[queue[h]][v] > 0) { parent[v] = queue[h]; queue.push(v); }
  if (parent[3] < 0) break;
  let flow = Infinity;
  for (let v = 3; v !== 0; v = parent[v]) flow = Math.min(flow, residual[parent[v]][v]);
  for (let v = 3; v !== 0; v = parent[v]) { residual[parent[v]][v] -= flow; residual[v][parent[v]] += flow; }
  total += flow;
}
console.log(total);
