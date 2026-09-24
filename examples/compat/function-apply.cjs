function describe(a, b, c) {
  console.log(this.label, arguments.length, a, b, c);
}
describe.apply({label: "array"}, [2, 4, 6]);
describe.apply({label: "holes"}, [, 4]);
let inherited = {1: 8, length: "3"};
describe.apply({label: "array-like"}, {__proto__: inherited, 0: 7, 2: 9});
function relay() {
  describe.apply({label: "arguments"}, arguments);
}
relay(10, 11, 12);
function sum(a, b) { return this.base + a + b; }
console.log(sum.apply.call(sum, {base: 20}, [1, 2]));
console.log(sum.call.apply(sum, [{base: 30}, 3, 4]));
function count() { return arguments.length; }
console.log(count.apply(), count.apply(null, null), count.apply(null, {length: 2.9}));
console.log(count.apply.name, count.apply.length, "prototype" in count.apply);
