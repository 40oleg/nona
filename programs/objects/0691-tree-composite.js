class Branch {
  constructor(name, children = []) { this.name = name; this.children = children; }
  *walk() {
    yield this.name;
    for (const child of this.children) yield* child.walk();
  }
  get size() { return 1 + this.children.reduce((n, child) => n + child.size, 0); }
}
const tree = new Branch("root", [new Branch("left"), new Branch("right", [new Branch("leaf")])]);
console.log(JSON.stringify([[...tree.walk()], tree.size]));
