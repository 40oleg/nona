class Pages {
  constructor(items, size) { this.items = items; this.size = size; }
  *[Symbol.iterator]() {
    for (let offset = 0; offset < this.items.length; offset += this.size) yield this.items.slice(offset, offset + this.size);
  }
  get count() { return Math.ceil(this.items.length / this.size); }
}
const pages = new Pages(["a", "b", "c", "d", "e"], 2);
const summaries = [...pages].map((page, index) => ({ page: index + 1, values: page.join("/") }));
console.log(JSON.stringify([pages.count, summaries]));
