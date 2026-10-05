function gcd(a, b) { while (b) [a, b] = [b, a % b]; return Math.abs(a); }
class Fraction {
  constructor(n, d) { if (!d) throw new Error('zero denominator'); const g = gcd(n, d), sign = d < 0 ? -1 : 1; this.n = n / g * sign; this.d = d / g * sign; }
  add(other) { return new Fraction(this.n * other.d + other.n * this.d, this.d * other.d); }
  multiply(other) { return new Fraction(this.n * other.n, this.d * other.d); }
  text() { return this.n + '/' + this.d; }
}
const sum = new Fraction(2, -6).add(new Fraction(5, 9));
console.log(sum.text() + ':' + sum.multiply(new Fraction(9, 2)).text());
