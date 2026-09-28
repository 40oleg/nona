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
