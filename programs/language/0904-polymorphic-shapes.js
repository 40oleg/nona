class Shape { describe() { return this.constructor.name+':'+this.area(); } }
class Rectangle extends Shape {
  constructor(width,height) { super(); this.width = width; this.height = height; }
  area() { return this.width*this.height; }
}
class Square extends Rectangle { constructor(side) { super(side,side); } }
function scene(...shapes) {
  const [first,...rest] = shapes;
  return {first:first.describe(),others:rest.map(shape => shape.describe()),area:shapes.reduce((sum,shape) => sum+shape.area(),0)};
}
console.log(JSON.stringify(scene(new Rectangle(2,3),new Square(4))));
