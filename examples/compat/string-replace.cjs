console.log('a,b,c'.replace(',', '[$&][$`][$\']'));
console.log('abcabc'.replace('bc', function (match, pos, source) { return match + pos + source.length; }));
var receiver = { toString: function () { throw Error('receiver converted'); } };
var search = { [Symbol.replace]: function (value, replacement) { return [value === receiver, replacement].join('|'); } };
console.log(String.prototype.replace.call(receiver, search, 3));
