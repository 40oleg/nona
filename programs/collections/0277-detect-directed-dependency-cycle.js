const graph = new Map([["a",["b"]],["b",["c"]],["c",["a"]]]);
const visiting = new Set();
const done = new Set();
function cyclic(node) {
  if (visiting.has(node)) return true;
  if (done.has(node)) return false;
  visiting.add(node);
  for (const next of graph.get(node)) if (cyclic(next)) return true;
  visiting.delete(node);
  done.add(node);
  return false;
}
console.log(JSON.stringify({cycle:cyclic("a"),visited:Array.from(visiting)}));
