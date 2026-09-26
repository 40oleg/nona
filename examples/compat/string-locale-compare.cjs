console.log('Å'.localeCompare('A\u030A'), '가'.localeCompare('가'));
console.log('a'.localeCompare('b'), 'b'.localeCompare('a'));
var receiver = {toString: function () { return 'e\u0301'; }};
console.log(String.prototype.localeCompare.call(receiver, 'é'));
