class Literal {
  constructor(value) { this.value = value; }
  evaluate() { return this.value; }
  toString() { return String(this.value); }
}
class Binary {
  constructor(operator, left, right) { Object.assign(this, { operator, left, right }); }
  evaluate() { const a = this.left.evaluate(), b = this.right.evaluate(); return this.operator === "+" ? a + b : a * b; }
  toString() { return "(" + this.left + this.operator + this.right + ")"; }
}
const expression = new Binary("*", new Binary("+", new Literal(2), new Literal(3)), new Literal(4));
console.log(JSON.stringify([String(expression), expression.evaluate()]));
