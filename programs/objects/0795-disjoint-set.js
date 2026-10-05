class UnionFind {
  constructor(names) { this.parent = new Map(names.map(name => [name, name])); }
  find(name) { const parent = this.parent.get(name); if (parent !== name) this.parent.set(name, this.find(parent)); return this.parent.get(name); }
  union(a, b) { this.parent.set(this.find(b), this.find(a)); }
  groups() {
    const groups = new Map();
    for (const name of this.parent.keys()) { const root = this.find(name); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(name); }
    return [...groups.values()];
  }
}
const sets = new UnionFind(["a", "b", "c", "d"]); sets.union("a", "b"); sets.union("c", "d"); sets.union("b", "c");
console.log(JSON.stringify(sets.groups()));
