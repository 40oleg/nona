function* walk(node) {
  const descend = yield node.name;
  if (descend !== false) for (const child of node.children ?? []) yield* walk(child);
}
const root = {name:'root',children:[{name:'skip',children:[{name:'hidden'}]},{name:'keep',children:[{name:'leaf'}]}]};
const iterator = walk(root), visited = [];
let step = iterator.next();
while (!step.done) {
  const {value} = step; visited.push(value);
  step = iterator.next(value !== 'skip');
}
console.log(JSON.stringify(visited));
