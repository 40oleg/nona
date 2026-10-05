const links = new Map([["a",["b","c"]],["b",["d"]],["c",["d","e"]],["d",[]],["e",[]]]);
const seen = new Set(["a"]);
let frontier = ["a"];
const layers = [];
while (frontier.length) {
  layers.push(frontier);
  const next = [];
  for (const person of frontier) for (const contact of links.get(person)) {
    if (!seen.has(contact)) { seen.add(contact); next.push(contact); }
  }
  frontier = next;
}
console.log(JSON.stringify(layers));
