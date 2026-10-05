const graph = new Map([['pack', ['compile']], ['compile', ['parse']], ['parse', []]]);
const visiting = new Set(), done = new Set(), order = [];
function visit(task) {
  if (visiting.has(task)) throw new Error('cycle');
  if (done.has(task)) return;
  visiting.add(task);
  for (const next of graph.get(task) || []) visit(next);
  visiting.delete(task); done.add(task); order.push(task);
}
for (const task of graph.keys()) visit(task);
if (order[0] !== 'parse') throw new Error('dependency');
console.log(order.join('>'));
