class Inventory extends Map {
  reserve(key, quantity) {
    const available = this.get(key) ?? 0;
    if (quantity > available) return false;
    this.set(key, available - quantity); return true;
  }
  toJSON() { return Object.fromEntries(this); }
}
const inventory = new Inventory([["pen", 4], ["pad", 2]]);
console.log(JSON.stringify([inventory.reserve("pen", 3), inventory.reserve("pad", 5), inventory]));
