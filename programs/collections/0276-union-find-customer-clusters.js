const parent = new Map(["a","b","c","d","e"].map(id=>[id,id]));
function root(id) {
  if (parent.get(id)!==id) parent.set(id,root(parent.get(id)));
  return parent.get(id);
}
for (const [a,b] of [["a","b"],["c","d"],["b","d"]]) parent.set(root(b),root(a));
const groups = new Map();
for (const id of parent.keys()) {
  const key = root(id);
  if (!groups.has(key)) groups.set(key,[]);
  groups.get(key).push(id);
}
console.log(JSON.stringify(Array.from(groups.values())));
