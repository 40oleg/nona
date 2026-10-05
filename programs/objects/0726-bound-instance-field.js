class Accumulator {
  #total = 0;
  add = value => { this.#total += value; };
  get total() { return this.#total; }
}
const accumulator = new Accumulator();
[1, 4, 9].forEach(accumulator.add);
const detached = accumulator.add;
detached(2);
console.log(JSON.stringify([accumulator.total, Object.keys(accumulator)]));
