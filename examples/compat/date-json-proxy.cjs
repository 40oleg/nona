var Constructor = function () {};
var custom = Reflect.construct(Date, [64], Constructor);
console.log(Object.getPrototypeOf(custom) === Constructor.prototype, Date.prototype.getTime.call(custom));
Constructor.prototype = null;
var fallback = Reflect.construct(Date, [64], Constructor);
console.log(Object.getPrototypeOf(fallback) === Date.prototype, fallback.getTime());

var replacer = new Proxy(['b'], {});
console.log(JSON.stringify({a: 1, b: 2}, replacer));
var values = new Proxy([], {
  get: function (target, key) {
    if (key === 'length') return 2;
    return Number(key);
  }
});
console.log(JSON.stringify(values));

var BufferConstructor = function () {};
BufferConstructor.prototype = null;
var ordinaryBuffer = Reflect.construct(ArrayBuffer, [2], BufferConstructor);
var sharedBuffer = Reflect.construct(SharedArrayBuffer, [3], BufferConstructor);
var view = Reflect.construct(DataView, [ordinaryBuffer, 0], BufferConstructor);
console.log(Object.getPrototypeOf(ordinaryBuffer) === ArrayBuffer.prototype, ordinaryBuffer.byteLength);
console.log(Object.getPrototypeOf(sharedBuffer) === SharedArrayBuffer.prototype, sharedBuffer.byteLength);
console.log(Object.getPrototypeOf(view) === DataView.prototype, view.byteLength);

for (var NativeConstructor of [Map, Set, WeakMap, WeakSet, RegExp, Array, Boolean, Number, String, Error, TypeError, Uint8Array, Float64Array]) {
  var constructed = Reflect.construct(NativeConstructor, [], BufferConstructor);
  console.log(NativeConstructor.name, Object.getPrototypeOf(constructed) === NativeConstructor.prototype);
}
