let model = {n: 3};
Object.defineProperty(model, "value", {
  get: function () { return this.n * 2; },
  set: function (v) { this.n = v / 2; },
  enumerable: true,
  configurable: true
});
console.log(model.value, model.value = 14, model.n);
let descriptor = Object.getOwnPropertyDescriptor(model, "value");
console.log(typeof descriptor.get, typeof descriptor.set, descriptor.enumerable, descriptor.configurable);
Object.defineProperty(model, "value", {value: 42, writable: false});
model.value = 99;
console.log(model.value, delete model.value);

let a = [0, 1, 2, 3, 4];
Object.defineProperty(a, 2, {configurable: false});
a.length = 1;
console.log(a.length, a[2], a[3], a.hasOwnProperty(4));
Object.defineProperty(a, "length", {writable: false});
a[7] = 8;
console.log(a.length, a[7]);

function mapped(value) {
  Object.defineProperty(arguments, 0, {value: 7, writable: false});
  console.log(value, arguments[0]);
  value = 9;
  console.log(value, arguments[0]);
}
mapped(1);
let text = new String("ab");
Object.defineProperty(text, 0, {value: "a"});
Object.defineProperty(text, "extra", {value: "ok"});
console.log(text[0], text.extra);
console.log(Object.defineProperty.name, Object.defineProperty.length);
