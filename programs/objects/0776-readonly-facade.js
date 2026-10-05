const state = { completed: 0, title: "work" };
const denied = [];
const facade = new Proxy(state, {
  set(target, key) { denied.push("set:" + String(key)); return true; },
  deleteProperty(target, key) { denied.push("delete:" + String(key)); return true; }
});
facade.completed = 99;
delete facade.title;
state.completed++;
console.log(JSON.stringify([facade, denied]));
