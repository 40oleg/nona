function size(node) { return node ? node.size : 0; }
function insert(node, value) {
  if (!node) return {value, count: 1, size: 1, left: null, right: null};
  if (value === node.value) node.count++;
  else if (value < node.value) node.left = insert(node.left, value); else node.right = insert(node.right, value);
  node.size = size(node.left) + size(node.right) + node.count; return node;
}
function select(node, rank) { const left = size(node.left); return rank < left ? select(node.left, rank) : rank < left + node.count ? node.value : select(node.right, rank - left - node.count); }
let root = null; for (const value of [4, 2, 6, 2, 5]) root = insert(root, value);
console.log([0, 2, 4].map(rank => select(root, rank)).join(','));
