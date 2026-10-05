class Circle {
  constructor(radius) { this.radius = radius; }
  accept(visitor) { return visitor.circle(this.radius); }
}
class Rectangle {
  constructor(width, height) { Object.assign(this, { width, height }); }
  accept(visitor) { return visitor.rectangle(this.width, this.height); }
}
const area = { circle: r => r * r * 3, rectangle: (w, h) => w * h };
const shapes = [new Circle(2), new Rectangle(3, 4)];
console.log(JSON.stringify(shapes.map(shape => shape.accept(area))));
