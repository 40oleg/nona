const tree = {label:"root",children:[{label:"a",children:[]},{label:"b",children:[{label:"c",children:[]}]}]};
function* labels(node) {
  yield node.label;
  for (const child of node.children) {
    yield* labels(child);
  }
}
const result = Array.from(labels(tree));
const initials = result.map(label=>label[0]).join("");
console.log(JSON.stringify({result,initials}));
