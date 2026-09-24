let parent = {inherited: 7}, child = {own: 8};
Object.setPrototypeOf(child, parent);
console.log(Object.getPrototypeOf(child) === parent, parent.isPrototypeOf(child));
console.log(child.hasOwnProperty("own"), child.hasOwnProperty("inherited"));
console.log(child.propertyIsEnumerable("own"), child.propertyIsEnumerable("inherited"));

let has = Object.prototype.hasOwnProperty;
let enumerable = Object.prototype.propertyIsEnumerable;
console.log(has.call("abc", "length"), enumerable.call("abc", "length"));
console.log(has.call("abc", 1), enumerable.call("abc", 1));
console.log([1,,3].hasOwnProperty(1), [1,2].propertyIsEnumerable("length"));

console.log(Object.is(NaN, NaN), Object.is(0, -0), Object.is(-0, -0));
console.log(Object.is(child, child), Object.is({}, {}));
let value = {x: 42, toString: function () { return "value=" + this.x; }};
console.log(value.toLocaleString());
Object.setPrototypeOf(child, null);
console.log(Object.getPrototypeOf(child), child.inherited, child.own);
