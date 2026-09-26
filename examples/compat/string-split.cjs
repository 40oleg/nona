console.log('a,b,,'.split(',').join('|'));
console.log('😀'.split('').length, 'a,b,c'.split(',', 2).join('|'));
var receiver = { toString: function () { throw Error('receiver converted'); } };
var separator = { [Symbol.split]: function (value, limit) { return [value === receiver, limit]; } };
console.log(String.prototype.split.call(receiver, separator, 2).join('|'));
