class Polynomial {
  constructor(coefficients) { this.coefficients = coefficients; }
  evaluate(x) { return this.coefficients.reduceRight((value, coefficient) => value * x + coefficient, 0); }
  derivative() { return new Polynomial(this.coefficients.slice(1).map((coefficient, index) => coefficient * (index + 1))); }
  toJSON() { return this.coefficients; }
}
const polynomial = new Polynomial([2, -3, 4]);
const derivative = polynomial.derivative();
console.log(JSON.stringify({
  value: polynomial.evaluate(2), derivative, slope: derivative.evaluate(2)
}));
