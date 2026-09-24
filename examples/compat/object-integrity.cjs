let object = {x: 1, nested: {x: 2}};
console.log(Object.isExtensible(object), Object.isSealed(object), Object.isFrozen(object));
Object.seal(object);
object.x = 3;
object.extra = 4;
console.log(object.x, object.extra, delete object.x, Object.isSealed(object));
Object.freeze(object);
object.x = 5;
object.nested.x = 6;
console.log(object.x, object.nested.x, Object.isFrozen(object));
let array = [1,,3];
Object.seal(array);
array.length = 1;
console.log(array.length, array.join('|'), Object.isFrozen(array));
Object.freeze(array);
console.log(Object.getOwnPropertyDescriptor(array, 'length').writable, Object.isFrozen(array));
function mapped(value) {
  Object.freeze(arguments);
  value = 9;
  console.log(value, arguments[0], Object.isFrozen(arguments));
}
mapped(7);
let n = 0, accessor = {};
Object.defineProperty(accessor, 'x', {set: function (v) {n = v;}, configurable: true});
Object.freeze(accessor);
accessor.x = 8;
console.log(n, Object.isFrozen(accessor));
console.log(Object.isFrozen('text'), Object.isSealed(null), Object.isExtensible(3));
