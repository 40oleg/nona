function record(name, price, quantity) {
  return {name, price, quantity};
}
const rows = [record("чай", 120, 3), record("coffee", 250, 2), record("水", 80, 4)];
const totals = {__proto__: null};
let total = 0;
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const amount = row.price * row.quantity;
  totals[row.name] = amount;
  total += amount;
  console.log(row.name, amount);
}
const alias = rows[0];
alias.quantity++;
console.log("total", total, totals["чай"], rows[0].quantity, alias === rows[0]);
let defaults = {currency: "RUB"};
let invoice = {__proto__: defaults, total};
console.log(invoice.currency, "currency" in invoice, delete invoice.currency, invoice.currency);
