class Theater {
  #seats = new Map();
  constructor(labels) { for (const label of labels) this.#seats.set(label, null); }
  book(label, guest) {
    if (!this.#seats.has(label) || this.#seats.get(label) !== null) return false;
    this.#seats.set(label, guest); return true;
  }
  cancel(label, guest) { if (this.#seats.get(label) !== guest) return false; this.#seats.set(label, null); return true; }
  toJSON() { return [...this.#seats].filter(([, guest]) => guest !== null); }
}
const theater = new Theater(["A1", "A2"]);
console.log(JSON.stringify([theater.book("A1", "Lin"), theater.book("A1", "Max"), theater.cancel("A1", "Max"), theater]));
