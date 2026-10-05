const documents = [{id:"a",tags:["red","round"]},{id:"b",tags:["blue","round"]},{id:"c",tags:["red","small"]}];
const index = new Map();
for (const document of documents) for (const tag of document.tags) {
  if (!index.has(tag)) index.set(tag,new Set());
  index.get(tag).add(document.id);
}
const required = ["red","round"];
const matches = documents.filter(document => required.every(tag => index.get(tag).has(document.id)));
const ids = matches.map(document => document.id);
console.log(JSON.stringify([Array.from(index,([tag,ids]) => [tag,Array.from(ids)]),ids]));
