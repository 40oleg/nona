class Scope {
  constructor(bindings, parent = null) { this.bindings = bindings; this.parent = parent; }
  resolve(name) { return Object.hasOwn(this.bindings, name) ? this.bindings[name] : this.parent?.resolve(name) ?? "missing"; }
  assign(name, value) { if (Object.hasOwn(this.bindings, name)) this.bindings[name] = value; else if (this.parent) this.parent.assign(name, value); else this.bindings[name] = value; }
}
const global = new Scope({ x: 1, y: 2 }), local = new Scope({ x: 9 }, global);
local.assign("y", 7);
console.log(JSON.stringify({
  x: local.resolve("x"), y: local.resolve("y"), z: local.resolve("z"), global: global.bindings
}));
