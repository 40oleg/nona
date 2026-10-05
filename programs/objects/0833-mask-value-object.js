class Permissions {
  constructor(bits = 0) { this.bits = bits; Object.freeze(this); }
  with(flag) { return new Permissions(this.bits | flag); }
  without(flag) { return new Permissions(this.bits & ~flag); }
  has(flag) { return (this.bits & flag) === flag; }
  toJSON() { return { read: this.has(1), write: this.has(2), execute: this.has(4) }; }
}
const original = new Permissions().with(1).with(2), limited = original.without(2);
console.log(JSON.stringify({
  original,
  limited,
  combined: original.has(3)
}));
