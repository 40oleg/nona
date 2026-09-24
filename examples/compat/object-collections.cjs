let prototype = {base: 10};
let object = Object.create(prototype, {
  z: {value: 3, enumerable: true, configurable: true},
  10: {value: 10, enumerable: true},
  2: {value: 2, enumerable: true},
  hidden: {value: 9},
  sum: {get: function () {return this.base + this.z;}, enumerable: true}
});
console.log(Object.keys(object).join('|'));
console.log(Object.values(object).join('|'));
console.log(Object.entries(object).join('|'));
console.log(Object.getOwnPropertyNames(object).join('|'));
let descriptors = Object.getOwnPropertyDescriptors(object);
let copy = Object.create(prototype, descriptors);
console.log(copy.sum, descriptors.hidden.enumerable, typeof descriptors.sum.get);
let target = {}, properties = {first: {value: 'first', enumerable: true}};
Object.defineProperty(properties, 'second', {enumerable: true, get: function () {
  console.log(target.first);
  return {value: 'second', enumerable: true};
}});
console.log(Object.defineProperties(target, properties) === target);
console.log(Object.keys(target).join('|'));
console.log(Object.getOwnPropertyNames('abc').join('|'));
console.log(Object.getOwnPropertyNames([1,,3]).join('|'));
