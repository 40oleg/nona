class Temperature {
  constructor(celsius) { this.celsius = celsius; }
  get fahrenheit() { return this.celsius * 9 / 5 + 32; }
  set fahrenheit(value) { this.celsius = (value - 32) * 5 / 9; }
  [Symbol.toPrimitive](hint) {
    return hint === "string" ? this.celsius + "C" : this.celsius;
  }
}
const sample = new Temperature(20);
sample.fahrenheit = 50;
console.log(JSON.stringify([String(sample), +sample, sample.fahrenheit]));
