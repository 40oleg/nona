const SCALE = Number(process.env.SCALE) || 1; const S = n => Math.round(n * SCALE);
class Shape { constructor(w) { this.w = w; } area() { return 0; } scaled() { return this.area() * 2; } }
class Square extends Shape { area() { return this.w * this.w; } }
class Circle extends Shape { area() { return 3 * this.w * this.w; } }
class Tri extends Shape { area() { return this.w * this.w / 2; } }
let t = performance.now();
const sq = new Square(3);
let s = 0;
for (let i = 0; i < S(5000000); i++) s += sq.scaled();
const tMono = performance.now() - t;
t = performance.now();
const shapes = [new Square(1), new Circle(2), new Tri(3)];
let s2 = 0;
for (let i = 0; i < S(5000000); i++) s2 += shapes[i % 3].scaled();
const tPoly = performance.now() - t;
t = performance.now();
const objs = new Array(S(1000000));
for (let i = 0; i < S(1000000); i++) objs[i] = new Square(i);
const tNew = performance.now() - t;
console.log(JSON.stringify({ mono5M: tMono, poly5M: tPoly, new1M: tNew, check: s + s2 + objs[5].w }));
