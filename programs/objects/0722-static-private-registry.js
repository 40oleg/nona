class Identifier {
  static #next = 1;
  #id;
  constructor(label) { this.#id = Identifier.#next++; this.label = label; }
  get id() { return this.#id; }
  static get allocated() { return this.#next - 1; }
  toJSON() { return { id: this.#id, label: this.label }; }
}
const records = [new Identifier("first"), new Identifier("second")];
console.log(JSON.stringify([records, Identifier.allocated]));
