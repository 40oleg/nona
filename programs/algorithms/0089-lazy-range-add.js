class RangeAdds {
  constructor(n) { this.n = n; this.lazy = Array(n * 4).fill(0); }
  add(start, end, amount, node = 1, low = 0, high = this.n) {
    if (end <= low || high <= start) return;
    if (start <= low && high <= end) { this.lazy[node] += amount; return; }
    const mid = (low + high) >> 1; this.add(start, end, amount, node * 2, low, mid); this.add(start, end, amount, node * 2 + 1, mid, high);
  }
  at(index, node = 1, low = 0, high = this.n) { if (high - low === 1) return this.lazy[node]; const mid = (low + high) >> 1; return this.lazy[node] + (index < mid ? this.at(index, node * 2, low, mid) : this.at(index, node * 2 + 1, mid, high)); }
}
const adds = new RangeAdds(4); adds.add(0, 3, 5); adds.add(1, 4, -2);
console.log([0, 1, 2, 3].map(i => adds.at(i)).join(','));
