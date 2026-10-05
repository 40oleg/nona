class Box {
  constructor(width) { this.width = width; }
  get size() { return this.width; }
  set size(value) { this.width = Math.max(0, value); }
}
class Square extends Box {
  get area() { return super.size * super.size; }
}
const square = new Square(4);
square.size = 7;
console.log(JSON.stringify([square.size, square.area, Object.keys(square)]));
