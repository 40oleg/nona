class Ring {
  #slots; #cursor = 0;
  constructor(capacity) { this.#slots = Array(capacity).fill(null); }
  push(value) { this.#slots[this.#cursor] = value; this.#cursor = (this.#cursor + 1) % this.#slots.length; }
  *[Symbol.iterator]() {
    for (let i = 0; i < this.#slots.length; i++) yield this.#slots[(this.#cursor + i) % this.#slots.length];
  }
}
const ring = new Ring(3);
for (const value of [5, 6, 7, 8]) ring.push(value);
console.log(JSON.stringify([...ring]));
