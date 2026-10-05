const tree = {kind:'section',children:[{kind:'text',value:'Hi'},{kind:'section',children:[{kind:'text',value:'Bye'}]}]};
function inspect(node, depth = 0, path = []) {
  const here = [...path,node.kind];
  const result = [{depth,path:here.join('/'),text:node.value ?? ''}];
  for (const child of node.children ?? []) {
    result.push(...inspect(child,depth+1,here));
  }
  return result;
}
const report = inspect(tree);
console.log(JSON.stringify(report));
console.log(report.reduce((sum,row) => sum + row.text.length,0));
