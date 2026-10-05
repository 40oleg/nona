class Transform {
  constructor(scale, dx, dy) { Object.assign(this, { scale, dx, dy }); }
  apply(point) { return { x: point.x * this.scale + this.dx, y: point.y * this.scale + this.dy }; }
  then(next) { return new Transform(this.scale * next.scale, this.dx * next.scale + next.dx, this.dy * next.scale + next.dy); }
}
const grow = new Transform(2, 1, -1), shift = new Transform(1, 3, 4), point = { x: 2, y: 5 };
console.log(JSON.stringify({
  composed: grow.then(shift).apply(point),
  sequential: shift.apply(grow.apply(point))
}));
