class Color {
  static pool = new Map();
  constructor(name) { this.name = name; Object.freeze(this); }
  static of(name) {
    const key = name.toLowerCase();
    if (!this.pool.has(key)) this.pool.set(key, new Color(key));
    return this.pool.get(key);
  }
}
const red = Color.of("Red");
console.log(JSON.stringify([red === Color.of("RED"), red === Color.of("blue"), Color.pool.size]));
