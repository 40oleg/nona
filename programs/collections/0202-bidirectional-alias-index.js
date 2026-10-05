const entries = [{name:"red",aliases:["scarlet","ruby"]},{name:"blue",aliases:["azure"]}];
const aliases = new Map();
for (const entry of entries) {
  aliases.set(entry.name,entry.name);
  for (const alias of entry.aliases) aliases.set(alias,entry.name);
}
const queries = ["ruby","blue","green","azure"];
const resolved = queries.map(query => aliases.get(query) ?? "unknown");
const distinct = new Set(resolved.filter(name => name!=="unknown"));
console.log(JSON.stringify([resolved,distinct.size]));
