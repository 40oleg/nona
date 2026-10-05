class Zipped {
  constructor(left, right) { this.left = left; this.right = right; }
  *[Symbol.iterator]() {
    const a = this.left[Symbol.iterator](), b = this.right[Symbol.iterator]();
    while (true) {
      const x = a.next(), y = b.next();
      if (x.done || y.done) return;
      yield [x.value, y.value];
    }
  }
}
console.log(JSON.stringify(Object.fromEntries(new Zipped(["x", "y", "z"], [4, 9]))));
