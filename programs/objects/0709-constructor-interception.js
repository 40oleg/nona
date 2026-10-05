class Point {
  constructor(x, y) { this.x = x; this.y = y; }
  toJSON() { return [this.x, this.y]; }
}
const created = [];
const TrackedPoint = new Proxy(Point, {
  construct(target, args, newTarget) {
    const point = Reflect.construct(target, args, newTarget);
    created.push(point); return point;
  }
});
const point = new TrackedPoint(2, 7);
console.log(JSON.stringify([point, point instanceof Point, created.length]));
