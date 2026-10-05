class Warehouse {
  #batches = [];
  receive(quantity, label) { this.#batches.push({ quantity, label }); }
  fulfill(quantity) {
    const picked = [];
    while (quantity > 0 && this.#batches.length) {
      const batch = this.#batches[0], amount = Math.min(quantity, batch.quantity);
      picked.push([batch.label, amount]); batch.quantity -= amount; quantity -= amount;
      if (!batch.quantity) this.#batches.shift();
    }
    return { picked, shortage: quantity };
  }
}
const stock = new Warehouse(); stock.receive(3, "old"); stock.receive(5, "new");
console.log(JSON.stringify([stock.fulfill(6), stock.fulfill(4)]));
