class Bundle {
  constructor(items) { Object.assign(this, items); this.length = items.length; }
  get [Symbol.isConcatSpreadable]() { return true; }
  get label() { return Array.from({ length: this.length }, (_, i) => this[i]).join("+"); }
}
const bundle = new Bundle(["tea", "cake"]);
const order = ["start"].concat(bundle, "end");
console.log(JSON.stringify({
  order,
  label: bundle.label
}));
