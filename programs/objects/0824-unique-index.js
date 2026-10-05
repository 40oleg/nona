class Directory {
  #names = new Map();
  #ids = new Map();
  add(id, name) { if (this.#names.has(name) || this.#ids.has(id)) return false; this.#names.set(name, id); this.#ids.set(id, name); return true; }
  rename(id, name) { if (!this.#ids.has(id) || this.#names.has(name)) return false; this.#names.delete(this.#ids.get(id)); this.#ids.set(id, name); this.#names.set(name, id); return true; }
  byName(name) { return this.#names.get(name) ?? null; }
  toJSON() { return Object.fromEntries(this.#ids); }
}
const directory = new Directory(); directory.add(1, "Ada"); directory.add(2, "Lin");
console.log(JSON.stringify([directory.rename(1, "Lin"), directory.rename(1, "Max"), directory.byName("Ada"), directory.byName("Max"), directory]));
