// Classes, generators and destructuring.
class Shape {
  constructor(name) { this.name = name; }
  describe() { return `${this.name} with area ${this.area().toFixed(2)}`; }
}
class Circle extends Shape {
  constructor(r) { super('circle'); this.r = r; }
  area() { return Math.PI * this.r ** 2; }
}
class Rect extends Shape {
  constructor(w, h) { super('rectangle'); Object.assign(this, {w, h}); }
  area() { return this.w * this.h; }
}

function* fibonacci() {
  let [a, b] = [0n, 1n];
  for (;;) { yield a; [a, b] = [b, a + b]; }
}

for (const shape of [new Circle(1.5), new Rect(2, 3)]) console.log(shape.describe());

const first = [];
for (const n of fibonacci()) {
  if (first.length === 12) break;
  first.push(n);
}
console.log('fibonacci:', first.join(' '));
console.log('fib(90) =', [...take(fibonacci(), 91)].pop());

function* take(iterable, count) {
  for (const value of iterable) {
    if (count-- <= 0) return;
    yield value;
  }
}
