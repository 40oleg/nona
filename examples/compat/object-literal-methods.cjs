let captured = 3;
let object = {
  value: 1,
  add(amount) {return this.value + amount + captured;},
  get total() {return this.value + captured;},
  set total(value) {this.value = value - captured;},
  ['computed' + 'Method'](a, b) {return a + b;}
};
console.log(object.add(2), object.total);
object.total = 10;
console.log(object.value, object.total, object.computedMethod(2, 4));
let descriptor = Object.getOwnPropertyDescriptor(object, 'total');
console.log(descriptor.get.name, descriptor.set.name, descriptor.get.length, descriptor.set.length);
console.log('prototype' in object.add, Object.keys(object).join('|'));
let other = {__proto__() {return 7;}, get x() {return 1;}, x: 2};
console.log(other.__proto__(), other.x, Object.getPrototypeOf(other) === Object.prototype);
let source = {m /* text */ (x) {return x;}};
console.log(source.m.toString());
Object.freeze(object);
console.log(Object.isFrozen(object));
