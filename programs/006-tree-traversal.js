// Recursive generator delegation traverses an object tree via for-of.
const tree = {name: 'a', children: [
  {name: 'b', children: [{name: 'd', children: []}, {name: 'e', children: []}]},
  {name: 'c', children: [{name: 'f', children: []}]},
]};
const preorder = [];
const postorder = [];
function* visit(node, afterChildren) {
  const {name, children} = node;
  if (!afterChildren) yield name;
  for (const child of children) yield* visit(child, afterChildren);
  if (afterChildren) yield name;
}

for (const name of visit(tree, false)) preorder.push(name);
for (const name of visit(tree, true)) postorder.push(name);
console.log(preorder.join(','));
console.log(postorder.join(','));
console.log(preorder.length);
