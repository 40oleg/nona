class OrderedRecord {
  #entries = [];
  set(key, value) { const entry = this.#entries.find(pair => pair[0] === key); if (entry) entry[1] = value; else this.#entries.push([key, value]); return this; }
  *[Symbol.iterator]() { for (const [key, value] of this.#entries) yield [key, value]; }
  toJSON() { return [...this]; }
}
const record = new OrderedRecord().set("10", "ten").set("2", "two").set("10", "TEN");
console.log(JSON.stringify({
  ordered: record,
  ordinaryKeys: Object.keys(Object.fromEntries(record))
}));
