class UndoGroups {
  constructor(n) { this.parents = Array.from({length: n}, (_, i) => i); this.log = []; }
  root(v) { while (this.parents[v] !== v) v = this.parents[v]; return v; }
  join(a, b) { a = this.root(a); b = this.root(b); if (a !== b) { this.log.push([b, this.parents[b]]); this.parents[b] = a; } }
  rollback(mark) { while (this.log.length > mark) { const [node, old] = this.log.pop(); this.parents[node] = old; } }
}
const groups = new UndoGroups(4); groups.join(0, 1); const mark = groups.log.length;
groups.join(1, 2); const during = groups.root(0) === groups.root(2); groups.rollback(mark);
console.log(during + ':' + (groups.root(0) === groups.root(2)) + ':' + (groups.root(0) === groups.root(1)));
