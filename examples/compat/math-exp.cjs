console.log(Math.exp(0), Math.exp(1), Math.exp(-Infinity), Math.exp(Infinity));
console.log(Math.expm1(0), Object.is(Math.expm1(-0), -0), Math.expm1(-Infinity));
console.log(Math.exp(710), Math.expm1(-10));
var x = { valueOf: function () { return 0; } };
console.log(Math.exp(x), Math.expm1(x));
