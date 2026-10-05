class Configuration {
  constructor(layers) { this.layers = layers; }
  get(key) {
    for (let i = this.layers.length - 1; i >= 0; i--) if (Object.hasOwn(this.layers[i], key)) return this.layers[i][key];
    return null;
  }
  snapshot() { return Object.assign({}, ...this.layers); }
}
const config = new Configuration([{ retries: 3, mode: "safe" }, { retries: 0 }, { color: "blue" }]);
console.log(JSON.stringify([config.get("retries"), config.get("missing"), config.snapshot()]));
