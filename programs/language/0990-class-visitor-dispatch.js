class Visitor {
  visit(node) {
    const method = this['on_'+node.kind];
    return method?.call(this,node) ?? 0;
  }
  on_number(node) { return node.value; }
  on_sum(node) { return node.children.reduce((sum,child) => sum+this.visit(child),0); }
}
const tree = {kind:'sum',children:[{kind:'number',value:3},{kind:'sum',children:[{kind:'number',value:4},{kind:'unknown'}]}]};
console.log(new Visitor().visit(tree));
console.log(new Visitor().visit({kind:'unknown'}));
