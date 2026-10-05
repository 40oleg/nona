const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function intersects(a, b, c, d) {
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0])) return false;
  if (Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
  return turn(a, b, c) * turn(a, b, d) <= 0 && turn(c, d, a) * turn(c, d, b) <= 0;
}
const tests = [[[0, 0], [3, 3], [0, 3], [3, 0]], [[0, 0], [1, 0], [1, 0], [2, 0]], [[0, 0], [1, 0], [2, 0], [3, 0]]];
console.log(tests.map(parts => intersects(...parts)).join(','));
