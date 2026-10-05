const roads = new Map([['start', ['left', 'right']], ['left', ['finish']], ['right', ['left', 'finish']], ['finish', []]]);
const memo = new Map();
function ways(node) {
  if (node === 'finish') return 1;
  if (memo.has(node)) return memo.get(node);
  const count = roads.get(node).reduce((sum, next) => sum + ways(next), 0);
  memo.set(node, count); return count;
}
const count = ways('start');
if (count !== 3) throw new Error('paths');
console.log(count + ':' + memo.size);
