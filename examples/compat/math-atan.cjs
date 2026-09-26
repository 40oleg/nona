console.log(Math.atan(0), Object.is(Math.atan(-0), -0));
console.log(Math.atan(Infinity), Math.atan(-Infinity));
console.log(Math.atan2(0, 1), Object.is(Math.atan2(-0, 1), -0));
console.log(Math.atan2(Infinity, Infinity), Math.atan2(-Infinity, -Infinity));
var order = '';
var y = { valueOf: function () { order += 'y'; return 0; } };
var x = { valueOf: function () { order += 'x'; return 1; } };
console.log(Math.atan2(y, x), order);
