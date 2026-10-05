const cache = new WeakMap();
let computations = 0;
function area(rectangle) {
  if (!cache.has(rectangle)) {
    computations++;
    cache.set(rectangle, rectangle.width * rectangle.height);
  }
  return cache.get(rectangle);
}
const first = { width: 3, height: 4 };
const second = { ...first };
console.log(JSON.stringify([area(first), area(first), area(second), computations]));
