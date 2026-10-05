class Annotations {
  #data = new WeakMap();
  mark(object, label) {
    const labels = this.#data.get(object) ?? new Set();
    labels.add(label); this.#data.set(object, labels);
  }
  read(object) { return [...(this.#data.get(object) ?? [])].sort(); }
}
const object = Object.freeze({ id: 3 }), annotations = new Annotations();
annotations.mark(object, "reviewed"); annotations.mark(object, "urgent");
console.log(JSON.stringify([annotations.read(object), annotations.read({ id: 3 }), Object.keys(object)]));
