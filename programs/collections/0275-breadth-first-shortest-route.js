const graph = new Map([["a",["b","c"]],["b",["d"]],["c",["e"]],["d",["f"]],["e",["f"]],["f",[]]]);
const previous = new Map([["a",null]]);
const queue = ["a"];
while (queue.length) {
  const current = queue.shift();
  for (const next of graph.get(current)) {
    if (!previous.has(next)) { previous.set(next,current); queue.push(next); }
  }
}
const route = [];
for (let node="f";node!==null;node=previous.get(node)) route.push(node);
console.log(route.reverse().join("->"));
