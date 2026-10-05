class Money {
  #cents;
  constructor(cents) { this.#cents = cents; }
  plus(other) { return new Money(this.#cents + other.#cents); }
  [Symbol.toPrimitive](hint) { return hint === "string" ? "$" + (this.#cents / 100).toFixed(2) : this.#cents; }
  toJSON() { return String(this); }
}
const subtotal = new Money(725), tax = new Money(58);
const total = subtotal.plus(tax);
console.log(JSON.stringify({ total, cents: +total, cheaper: subtotal < total }));
