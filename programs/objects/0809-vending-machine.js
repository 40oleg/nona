class VendingMachine {
  #credit = 0;
  constructor(stock) { this.stock = new Map(stock); }
  insert(amount) { this.#credit += amount; }
  select(name, price) {
    if (!(this.stock.get(name) > 0)) return "empty";
    if (this.#credit < price) return "insufficient";
    this.#credit -= price; this.stock.set(name, this.stock.get(name) - 1); return name;
  }
  refund() { const credit = this.#credit; this.#credit = 0; return credit; }
}
const machine = new VendingMachine([["tea", 1]]); machine.insert(5);
console.log(JSON.stringify([machine.select("tea", 3), machine.select("tea", 3), machine.refund()]));
