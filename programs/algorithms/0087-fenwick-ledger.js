class Ledger {
  constructor(size) { this.tree = new Int32Array(size + 1); }
  add(index, amount) { for (let i = index + 1; i < this.tree.length; i += i & -i) this.tree[i] += amount; }
  prefix(end) { let total = 0; for (let i = end; i > 0; i -= i & -i) total += this.tree[i]; return total; }
  range(start, end) { return this.prefix(end) - this.prefix(start); }
}
const ledger = new Ledger(5);
[4, 2, 7, 1, 3].forEach((value, i) => ledger.add(i, value)); ledger.add(2, -2);
if (ledger.range(1, 4) !== 8) throw new Error('range accounting');
console.log(ledger.prefix(5) + ':' + ledger.range(1, 4));
