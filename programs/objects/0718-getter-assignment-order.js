const events = [];
const order = { prices: [12, 18, 10] };
const valuation = {
  get subtotal() { events.push("calculate-subtotal"); return order.prices.reduce((sum, price) => sum + price, 0); },
  get tax() { events.push("calculate-tax"); return order.prices.reduce((sum, price) => sum + price, 0) / 10; }
};
const invoice = {
  amount: 0,
  set subtotal(value) { events.push("post-subtotal"); this.amount += value; },
  set tax(value) { events.push("post-tax"); this.amount += value; }
};
Object.assign(invoice, valuation);
console.log(JSON.stringify({ payable: invoice.amount, postingOrder: events }));
