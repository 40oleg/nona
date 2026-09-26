var text = String.fromCodePoint(65, 0x1f600, 0x10ffff);
console.log(text.length, text.charCodeAt(0), text.codePointAt(1), text.codePointAt(3));
console.log(String.fromCodePoint().length, String.fromCodePoint.length);
var order = '';
var first = { valueOf: function () { order += 'a'; return 66; } };
var second = { valueOf: function () { order += 'b'; return 0x1f642; } };
console.log(String.fromCodePoint(first, second), order);
