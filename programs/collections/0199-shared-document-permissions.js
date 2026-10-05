const grants = new Set(["read","comment","export"]);
const documents = [{id:"a",needs:["read"]},{id:"b",needs:["read","edit"]},{id:"c",needs:["read","export"]}];
const allowed = documents.filter(document => {
  return document.needs.every(permission => grants.has(permission));
});
const denied = documents.filter(document => !allowed.includes(document));
const result = {
  allowed:allowed.map(document => document.id),
  denied:denied.map(document => document.id)
};
console.log(JSON.stringify(result));
