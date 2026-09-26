console.log(Math.sinh(0), Object.is(Math.sinh(-0), -0), Math.sinh(Infinity), Math.sinh(-Infinity));
console.log(Math.cosh(0), Math.cosh(Infinity), Math.cosh(-Infinity));
console.log(Math.tanh(0), Object.is(Math.tanh(-0), -0), Math.tanh(Infinity), Math.tanh(-Infinity));
console.log(Math.sinh(1) > 1, Math.cosh(1) > 1, Math.tanh(1) > 0);
