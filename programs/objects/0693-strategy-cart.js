class Cart {
  constructor(prices, discount) { this.prices = prices; this.discount = discount; }
  get subtotal() { return this.prices.reduce((a, b) => a + b, 0); }
  checkout() { return this.discount(this.subtotal); }
}
const cart = new Cart([12, 18, 10], total => total - 5);
const first = cart.checkout();
cart.discount = total => total * 0.75;
console.log(JSON.stringify({
  first,
  second: cart.checkout(),
  subtotal: cart.subtotal
}));
