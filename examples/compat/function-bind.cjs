function sum(a, b, c) { return this.base + a + b + c; }
let add = sum.bind({base: 10}, 1).bind({base: 100}, 2);
console.log(add(3), add.call({base: 1000}, 4), add.apply(null, [5]));
console.log(add.name, add.length, typeof add, "prototype" in add);
function Point(x, y) { this.x = x; this.y = y; }
let receiver = {x: 0};
let AlongX = Point.bind(receiver, 7);
let point = new AlongX(9);
console.log(point.x, point.y, receiver.x, point instanceof Point, point instanceof AlongX);
AlongX.prototype = {wrong: true};
console.log(point instanceof AlongX, (new AlongX(11)).wrong);
function box() { return this; }
let boxed = box.bind(3);
console.log(boxed() + 1, boxed() === boxed());
function factory(n) {
  return function(a) { return n + a.value + this.value; }.bind({value: 20}, {value: 30});
}
let retained = factory(12);
for (let i = 0; i < 1000; i++) { ({value: "" + i}); }
console.log(retained());
