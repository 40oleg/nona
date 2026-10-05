const points = [[0, 0], [2, 0], [1, 0], [2, 2], [1, 1], [0, 2]];
points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function half(values) {
  const result = [];
  for (const point of values) { while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop(); result.push(point); }
  result.pop(); return result;
}
const hull = [...half(points), ...half(points.slice().reverse())];
console.log(JSON.stringify(hull));
