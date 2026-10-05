class Components {
  constructor(n) { this.parent = Array.from({length: n}, (_, i) => i); }
  root(i) { while (this.parent[i] !== i) i = this.parent[i]; return i; }
  merge(a, b) { a = this.root(a); b = this.root(b); if (a === b) return false; this.parent[b] = a; return true; }
}
const groups = new Components(4), accepted = [];
let cost = 0;
for (const [a, b, w] of [[0, 1, 3], [1, 2, 1], [0, 2, 2], [2, 3, 4]].sort((a, b) => a[2] - b[2])) {
  if (groups.merge(a, b)) { accepted.push([a, b]); cost += w; }
}
if (cost !== 7 || accepted.length !== 3) throw new Error('tree');
console.log(cost + ':' + JSON.stringify(accepted));
