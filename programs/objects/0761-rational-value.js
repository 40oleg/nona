class Fraction {
  constructor(numerator, denominator) {
    if (!denominator) throw new Error("zero denominator");
    let a = Math.abs(numerator), b = Math.abs(denominator);
    while (b) [a, b] = [b, a % b];
    this.numerator = numerator / a; this.denominator = denominator / a;
  }
  add(other) { return new Fraction(this.numerator * other.denominator + other.numerator * this.denominator, this.denominator * other.denominator); }
  [Symbol.toPrimitive](hint) { return hint === "string" ? this.numerator + "/" + this.denominator : this.numerator / this.denominator; }
}
const sum = new Fraction(1, 6).add(new Fraction(1, 3));
console.log(JSON.stringify([String(sum), +sum]));
