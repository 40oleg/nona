console.log((1.25).toFixed(1), (2.55).toFixed(1), (1.005).toFixed(2));
console.log((-0.001).toFixed(2), (-0).toFixed(2), (123).toFixed(4));
console.log((1e21).toFixed(2), (5e-324).toFixed(100));
console.log(Number.prototype.toFixed.call(new Number(1.5), 0));
