class Invoice {
  constructor(lines) { this.lines = lines; this.adjustments = []; }
  credit(reason, amount) { this.adjustments.push({ reason, amount: -Math.abs(amount) }); }
  get total() { return this.lines.reduce((sum, line) => sum + line.price * line.quantity, 0) + this.adjustments.reduce((sum, line) => sum + line.amount, 0); }
  toJSON() { return { total: this.total, reasons: this.adjustments.map(a => a.reason) }; }
}
const invoice = new Invoice([{ price: 4, quantity: 3 }, { price: 7, quantity: 2 }]);
invoice.credit("damaged", 4);
console.log(JSON.stringify(invoice));
