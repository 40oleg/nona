const tree = ["a.txt",["b.js",["c.md","d.md"]],[],"e.js"];
function count(node) {
  if (!Array.isArray(node)) return 1;
  return node.reduce((total,child) => total+count(child),0);
}
function depth(node) {
  if (!Array.isArray(node) || node.length===0) return 0;
  return 1+Math.max(...node.map(depth));
}
console.log(JSON.stringify({files:count(tree),depth:depth(tree)}));
