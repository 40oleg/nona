const tree = {name:"all",own:2,children:[{name:"dev",own:8,children:[{name:"qa",own:3,children:[]}]},{name:"ops",own:5,children:[]}]};
const totals = [];
function visit(node) {
  const childTotal = node.children.reduce((sum,child) => sum+visit(child),0);
  const total = node.own+childTotal;
  totals.push([node.name,total]);
  return total;
}
const grand = visit(tree);
console.log(JSON.stringify({totals,grand}));
