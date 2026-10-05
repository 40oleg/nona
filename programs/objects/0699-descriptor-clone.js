const source = { base: 6, get doubled() { return this.base * 2; } };
Object.defineProperty(source, "label", { value: "fixed", enumerable: false });
const copy = Object.create(Object.getPrototypeOf(source), Object.getOwnPropertyDescriptors(source));
copy.base = 9;
const descriptor = Object.getOwnPropertyDescriptor(copy, "doubled");
console.log(JSON.stringify({
  source: source.doubled,
  copy: copy.doubled,
  getterPreserved: typeof descriptor.get,
  label: copy.label
}));
