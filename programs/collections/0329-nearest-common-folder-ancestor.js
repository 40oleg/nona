const parents = new Map([["root",null],["docs","root"],["src","root"],["notes","docs"],["drafts","notes"],["published","docs"]]);
const ancestors = new Set();
let current = "drafts";
while (current!==null) { ancestors.add(current); current=parents.get(current); }
current = "published";
const path = [];
while (!ancestors.has(current)) {
  path.push(current);
  current=parents.get(current);
}
console.log(JSON.stringify({common:current,path,ancestors:Array.from(ancestors)}));
