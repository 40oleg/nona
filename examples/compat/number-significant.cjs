console.log((123.456).toExponential(), (123.456).toPrecision());
console.log((123.456).toExponential(2), (123.456).toPrecision(4));
console.log((0.9999).toExponential(1), (0.9999).toPrecision(2));
console.log((5e-324).toExponential(17), (5e-324).toPrecision(17));
console.log((0).toExponential(3), (-0).toPrecision(4));
console.log(NaN.toExponential(Infinity), Infinity.toPrecision(1000));
