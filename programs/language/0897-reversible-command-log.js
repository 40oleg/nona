class Position {
  constructor() { this.x = 0; this.y = 0; this.history = []; }
  move({dx,dy}) {
    this.x += dx; this.y += dy;
    this.history.push(() => { this.x -= dx; this.y -= dy; });
  }
  undo() { this.history.pop()?.(); }
  read() { return [this.x,this.y]; }
}
const point = new Position();
point.move({dx:3,dy:1}); point.move({dx:-2,dy:4}); point.undo();
console.log(JSON.stringify(point.read()));
