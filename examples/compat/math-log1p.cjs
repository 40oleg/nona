console.log(Math.log1p(0), Object.is(Math.log1p(-0), -0));
console.log(Math.log1p(-1), Math.log1p(-2), Math.log1p(Infinity));
console.log(Math.log1p(1e-30) > 0, Math.log1p(-1e-30) < 0);
