class Vector {
  constructor(x, y) { this.x = x; this.y = y; Object.freeze(this); }
  add(other) { return new Vector(this.x + other.x, this.y + other.y); }
  get normSquared() { return this.x * this.x + this.y * this.y; }
  toJSON() { return [this.x, this.y]; }
}
const a = new Vector(3, 4);
const b = a.add(new Vector(-1, 2));
const changed = Reflect.set(a, "x", 9);
console.log(JSON.stringify([a, b, b.normSquared, changed]));
