const raw = { public: 1, _internal: 2, label: "ok" };
const view = new Proxy(raw, {
  ownKeys(target) { return Reflect.ownKeys(target).filter(key => !String(key).startsWith("_")); },
  getOwnPropertyDescriptor(target, key) { return Reflect.getOwnPropertyDescriptor(target, key); }
});
const spread = { ...view };
console.log(JSON.stringify({
  keys: Object.keys(view),
  spread,
  direct: view._internal
}));
