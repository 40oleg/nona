const managers = [{id:1,name:"Iris"},{id:2,name:"Omar"}];
const employees = [{name:"Ada",boss:2},{name:"Ben",boss:9},{name:"Cy",boss:1}];
const index = new Map();
for (const manager of managers) {
  index.set(manager.id, manager.name);
}
const joined = employees.map(person => {
  const manager = index.get(person.boss) ?? "unassigned";
  return person.name + "/" + manager;
});
console.log(joined.join(","));
