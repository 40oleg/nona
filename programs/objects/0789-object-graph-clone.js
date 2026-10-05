function cloneGraph(node, copies = new Map()) {
  if (copies.has(node)) return copies.get(node);
  const copy = { label: node.label, edges: [] };
  copies.set(node, copy);
  copy.edges = node.edges.map(edge => cloneGraph(edge, copies));
  return copy;
}
const root = { label: "root", edges: [] }, shared = { label: "shared", edges: [] };
root.edges = [shared, shared]; shared.edges = [root];
const copy = cloneGraph(root);
console.log(JSON.stringify([copy !== root, copy.edges[0] === copy.edges[1], copy.edges[0].edges[0] === copy, copy.label]));
