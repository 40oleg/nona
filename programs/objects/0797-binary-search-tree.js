class Node {
  constructor(value) { this.value = value; this.left = null; this.right = null; }
  insert(value) { const side = value < this.value ? "left" : "right"; if (value === this.value) return; if (this[side]) this[side].insert(value); else this[side] = new Node(value); }
  *[Symbol.iterator]() { if (this.left) yield* this.left; yield this.value; if (this.right) yield* this.right; }
  get height() { return 1 + Math.max(this.left?.height ?? 0, this.right?.height ?? 0); }
}
const tree = new Node(5);
for (const value of [3, 8, 1, 4, 7, 3]) tree.insert(value);
console.log(JSON.stringify({
  sorted: [...tree], height: tree.height
}));
