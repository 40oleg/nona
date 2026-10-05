const toggles = ["news","sports","news","music","sports","news"];
const active = new Set();
const history = [];
for (const topic of toggles) {
  if (active.has(topic)) active.delete(topic);
  else active.add(topic);
  history.push(Array.from(active));
}
const final = Array.from(active).join("+");
console.log(JSON.stringify({history,final}));
