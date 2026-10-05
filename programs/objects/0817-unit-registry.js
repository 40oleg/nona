class Units {
  #units = new Map();
  register(name, factor, dimension) { this.#units.set(name, { factor, dimension }); return this; }
  convert(value, from, to) {
    const a = this.#units.get(from), b = this.#units.get(to);
    if (!a || !b || a.dimension !== b.dimension) throw new Error("incompatible");
    return value * a.factor / b.factor;
  }
}
const units = new Units().register("m", 1, "length").register("cm", 0.01, "length").register("s", 1, "time");
const results = [units.convert(250, "cm", "m")];
try { units.convert(2, "m", "s"); } catch (error) { results.push(error.message); }
console.log(JSON.stringify(results));
