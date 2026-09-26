console.log(Math.log(1), Math.log2(1), Math.log10(1));
console.log(Math.log(0), Math.log2(0), Math.log10(0));
console.log(Math.log(-1), Math.log2(-1), Math.log10(-1));
console.log(Math.log(Infinity), Math.log2(Infinity), Math.log10(Infinity));
var x = { valueOf: function () { return 1; } };
console.log(Math.log(x), Math.log2(x), Math.log10(x));
