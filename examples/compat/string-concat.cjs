console.log('a'.concat('b', 3, null, undefined));
console.log(String.prototype.concat.call(123, 'x'));
var order = '';
var receiver = { toString: function () { order += 'r'; return 'a'; } };
var first = { toString: function () { order += '1'; return 'b'; } };
var second = { toString: function () { order += '2'; return 'c'; } };
console.log(String.prototype.concat.call(receiver, first, second), order);
