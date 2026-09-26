console.log(Math.cbrt(0), Object.is(Math.cbrt(-0), -0));
console.log(Math.cbrt(Infinity), Math.cbrt(-Infinity), Math.cbrt(NaN));
console.log(Math.cbrt(8) > 1.999999999999, Math.cbrt(-27) < -2.999999999999);
