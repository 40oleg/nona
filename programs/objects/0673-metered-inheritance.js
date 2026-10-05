class Counter {
  constructor() { this.value = 0; }
  add(step) { this.value += step; return this.value; }
}
class Meter extends Counter {
  #calls = 0;
  add(step) { this.#calls++; return super.add(step * 2); }
  get calls() { return this.#calls; }
}
const meter = new Meter();
console.log(JSON.stringify([meter.add(3), meter.add(-1), meter.calls, meter instanceof Counter]));
