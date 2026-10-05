class Path {
  constructor(parts = []) { this.parts = parts; }
  child(name) { return new Path([...this.parts, name]); }
  get parent() { return new Path(this.parts.slice(0, -1)); }
  get name() { return this.parts.at(-1) ?? "root"; }
  relativeTo(base) { let i = 0; while (i < base.parts.length && this.parts[i] === base.parts[i]) i++; return [...Array(base.parts.length - i).fill(".."), ...this.parts.slice(i)].join("/") || "."; }
  toString() { return "/" + this.parts.join("/"); }
}
const base = new Path(["home", "ada"]), file = base.child("notes").child("todo");
console.log(JSON.stringify([String(file), String(file.parent), file.name, file.relativeTo(base.child("photos"))]));
