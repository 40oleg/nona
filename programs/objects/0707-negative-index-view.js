const items = [10, 20, 30, 40];
const view = new Proxy(items, {
  get(target, key, receiver) {
    const n = Number(key);
    if (typeof key === "string" && Number.isInteger(n) && n < 0) return target[target.length + n];
    return Reflect.get(target, key, receiver);
  }
});
console.log(JSON.stringify([
  view[-1], view[-3], view[0], view.length
]));
