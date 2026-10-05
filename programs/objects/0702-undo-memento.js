class Canvas {
  #points = [];
  add(x, y) { this.#points.push({ x, y }); }
  save() { return this.#points.map(p => ({ ...p })); }
  restore(snapshot) { this.#points = snapshot.map(p => ({ ...p })); }
  toJSON() { return this.#points; }
}
const canvas = new Canvas();
canvas.add(1, 2); const checkpoint = canvas.save();
canvas.add(4, 5); canvas.restore(checkpoint); checkpoint[0].x = 99;
console.log(JSON.stringify(canvas));
