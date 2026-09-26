console.log(String.raw`first\nsecond${42}end`);
console.log(String.raw({ raw: ['a', 'b', 'c'] }, 7, 9, 11));
console.log(String.raw({ raw: { length: 0 } }, 'ignored'));
var events = '';
var template = { get raw() { events += 'r'; return { length: 2, get 0() { events += '0'; return 'A'; }, get 1() { events += '1'; return 'B'; } }; } };
var value = { toString: function () { events += 's'; return '-'; } };
console.log(String.raw(template, value), events);
