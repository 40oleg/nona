const counts = Object.create(null);
const counter = new Proxy(counts, {
  get(target, key) { return Object.hasOwn(target, key) ? target[key] : 0; },
  set(target, key, value) { return Reflect.set(target, key, value); }
});
for (const kind of ["red", "blue", "red", "constructor"]) counter[kind]++;
console.log(JSON.stringify({
  counts,
  absent: counter.green,
  own: Object.keys(counts).length
}));
