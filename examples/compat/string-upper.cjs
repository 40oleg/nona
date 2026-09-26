console.log('abc à ß ﬃ ı 𐐨'.toUpperCase());
console.log('😀\ud800\udc00\ud800x'.toUpperCase().length);
var receiver = { toString: function () { return 'Straße'; } };
console.log(String.prototype.toUpperCase.call(receiver));
