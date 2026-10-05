class PairableQuantity {
  static [Symbol.hasInstance](value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 && value % 2 === 0;
  }
}
class PackingDesk {
  constructor() { this.pairs = 0; this.rejected = []; }
  accept(quantity) {
    if (!(quantity instanceof PairableQuantity)) { this.rejected.push(quantity); return false; }
    this.pairs += quantity / 2; return true;
  }
}
const desk = new PackingDesk();
const accepted = [2, 3, 2.5, "4", 8].map(quantity => desk.accept(quantity));
console.log(JSON.stringify([accepted, desk.pairs, desk.rejected]));
