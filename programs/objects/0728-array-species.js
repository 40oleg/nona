class Shipment extends Array {
  static get [Symbol.species]() { return Array; }
  shippingCost() { return this.reduce((sum, item) => sum + item.weight * 3 + 2, 0); }
  invoice() { return this.map(item => ({ sku: item.sku, charge: item.weight * 3 + 2 })); }
}
const shipment = new Shipment({ sku: "tea", weight: 2 }, { sku: "book", weight: 3 });
const invoice = shipment.invoice();
invoice.push({ sku: "insurance", charge: 1 });
console.log(JSON.stringify({
  shipping: shipment.shippingCost(),
  invoice,
  payable: invoice.reduce((sum, line) => sum + line.charge, 0)
}));
