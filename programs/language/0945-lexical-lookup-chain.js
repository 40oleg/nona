class Scope {
  constructor(parent = null) { this.parent = parent; this.values = {}; }
  define(name,value) { this.values[name] = value; }
  lookup(name) { return Object.prototype.hasOwnProperty.call(this.values,name) ? this.values[name] : this.parent?.lookup(name); }
}
const global = new Scope(); global.define('x',4); global.define('y',2);
const local = new Scope(global); local.define('x',0);
const inner = new Scope(local); inner.define('z',7);
console.log(JSON.stringify(['x','y','z','q'].map(name => inner.lookup(name) ?? 'undefined')));
console.log(global.lookup('x'));
