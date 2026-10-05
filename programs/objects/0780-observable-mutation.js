const events = [];
const model = new Proxy({ status: "idle", progress: 0 }, {
  set(target, key, value) {
    const old = target[key];
    if (old !== value) events.push({ key, old, value });
    return Reflect.set(target, key, value);
  }
});
model.status = "running"; model.progress = 50; model.progress = 50; model.status = "done";
console.log(JSON.stringify([model, events]));
