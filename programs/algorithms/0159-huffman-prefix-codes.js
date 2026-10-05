const queue = [{symbol: 'a', weight: 5}, {symbol: 'b', weight: 2}, {symbol: 'c', weight: 1}, {symbol: 'd', weight: 1}];
while (queue.length > 1) {
  queue.sort((a, b) => a.weight - b.weight);
  const left = queue.shift(), right = queue.shift();
  queue.push({symbol: '', weight: left.weight + right.weight, left, right});
}
const codes = new Map();
function assign(node, prefix) { if (node.symbol) codes.set(node.symbol, prefix); else { assign(node.left, prefix + '0'); assign(node.right, prefix + '1'); } }
assign(queue[0], '');
const encoded = [...'abcd'].map(char => codes.get(char)).join('');
console.log(encoded + ':' + [...codes].map(([c, bits]) => c + '=' + bits).join(','));
