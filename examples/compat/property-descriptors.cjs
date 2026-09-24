function describe(object, key) {
  let d = Object.getOwnPropertyDescriptor(object, key);
  if (d === undefined) { console.log("missing"); return; }
  console.log("value" in d, d.value, d.writable, d.enumerable, d.configurable);
}
let o = {__proto__: {inherited: 7}, own: 42};
describe(o, "inherited");
describe(o, "own");
let copy = Object.getOwnPropertyDescriptor(o, "own");
copy.value = 99;
console.log(o.own, copy.value, Object.getPrototypeOf(copy) === Object.prototype);
describe([1,,3], "length");
describe([1,,3], 1);
describe("abc", 1);
describe("abc", "length");

function mapped(a) {
  a = 9;
  describe(arguments, 0);
  arguments[0] = 12;
  console.log(a);
}
mapped(1);
describe(mapped, "name");
describe(mapped, "length");

let proto = Object.getOwnPropertyDescriptor(Object.prototype, "__proto__");
console.log(typeof proto.get, typeof proto.set, "value" in proto, proto.enumerable, proto.configurable);
console.log(proto.get.name, proto.get.length, proto.set.name, proto.set.length);
let p = {answer: 42}, child = {};
proto.set.call(child, p);
console.log(proto.get.call(child) === p, child.answer);
console.log(Object.getOwnPropertyDescriptor.name, Object.getOwnPropertyDescriptor.length);
