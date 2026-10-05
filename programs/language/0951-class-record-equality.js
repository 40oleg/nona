class Coordinate {
  constructor(x,y) { this.x = x; this.y = y; }
  equals({x,y}) { return this.x === x && this.y === y; }
  with({x=this.x,y=this.y} = {}) { return new Coordinate(x,y); }
  toString() { return this.x+','+this.y; }
}
const a = new Coordinate(2,3), b = a.with({y:5}), c = a.with();
console.log(JSON.stringify({a:a.toString(),b:b.toString(),equal:a.equals(c),same:a === c}));
console.log(b.equals(a));
console.log(c instanceof Coordinate);
