const receipt = { subtotal: 20, tax: 3 };
Object.defineProperty(receipt, "total", {
  value() { return this.subtotal + this.tax; },
  writable: false,
  enumerable: false
});
const method = receipt.total.bind(receipt);
console.log(JSON.stringify({
  total: method(),
  keys: Object.keys(receipt),
  replaced: Reflect.set(receipt, "total", () => 0)
}));
