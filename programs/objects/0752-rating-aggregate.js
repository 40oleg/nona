class Product {
  #ratings = new Map();
  constructor(name) { this.name = name; }
  rate(user, stars) { if (!Number.isInteger(stars) || stars < 1 || stars > 5) return false; this.#ratings.set(user, stars); return true; }
  get average() { return [...this.#ratings.values()].reduce((sum, n) => sum + n, 0) / this.#ratings.size; }
  toJSON() { return { name: this.name, count: this.#ratings.size, average: this.average }; }
}
const product = new Product("Lamp"); product.rate("A", 3); product.rate("B", 5); product.rate("A", 4);
console.log(JSON.stringify([product.rate("C", 8), product]));
