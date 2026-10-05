const groups = [["tools",["saw","drill"]],["paint",["blue"]],["tools",["drill","file"]]];
const catalog = new Map();
for (const [category, names] of groups) {
  if (!catalog.has(category)) catalog.set(category, new Set());
  for (const name of names) catalog.get(category).add(name);
}
const result = [];
for (const [category,names] of catalog) {
  result.push([category,Array.from(names).sort()]);
}
console.log(JSON.stringify(result));
