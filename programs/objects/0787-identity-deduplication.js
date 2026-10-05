class Registry {
  #members = new WeakSet();
  #labels = [];
  register(object) {
    if (this.#members.has(object)) return false;
    this.#members.add(object); this.#labels.push(object.label); return true;
  }
  get labels() { return this.#labels.slice(); }
}
const registry = new Registry(), first = { label: "same" }, second = { label: "same" };
console.log(JSON.stringify([registry.register(first), registry.register(first), registry.register(second), registry.labels]));
