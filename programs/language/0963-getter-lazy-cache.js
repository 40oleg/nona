class Rectangle {
  constructor(width,height) { this.width = width; this.height = height; this.cached = null; this.computations = 0; }
  get area() { this.cached ??= this.compute(); return this.cached; }
  compute() { this.computations++; return this.width*this.height; }
  resize(width,height) { this.width = width; this.height = height; this.cached = null; }
}
const box = new Rectangle(3,4);
const values = [box.area,box.area];
box.resize(2,5); values.push(box.area);
console.log(JSON.stringify({values,computations:box.computations}));
