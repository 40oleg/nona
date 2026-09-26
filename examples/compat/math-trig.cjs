console.log(Math.sin(0), Math.cos(0), Math.tan(0));
console.log(Object.is(Math.sin(-0), -0), Object.is(Math.tan(-0), -0));
console.log(Math.sin(Infinity), Math.cos(-Infinity), Math.tan(NaN));
var x = { valueOf: function () { return 0; } };
console.log(Math.sin(x), Math.cos(x), Math.tan(x));
