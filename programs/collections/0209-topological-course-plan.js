const prerequisites = new Map([["intro",[]],["arrays",["intro"]],["maps",["arrays"]],["project",["maps","arrays"]]]);
const completed = new Set();
const order = [];
while (completed.size<prerequisites.size) {
  const ready = Array.from(prerequisites).find(([name,needs]) => !completed.has(name)&&needs.every(need=>completed.has(need)));
  if (!ready) break;
  completed.add(ready[0]);
  order.push(ready[0]);
}
console.log(JSON.stringify([order,completed.size===prerequisites.size]));
