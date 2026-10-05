const polygon = [[0, 0], [4, 0], [4, 3], [0, 3]];
let area2 = 0, numeratorX = 0, numeratorY = 0;
for (let i = 0; i < polygon.length; i++) {
  const [x, y] = polygon[i], [u, v] = polygon[(i + 1) % polygon.length];
  const cross = x * v - u * y;
  area2 += cross; numeratorX += (x + u) * cross; numeratorY += (y + v) * cross;
}
console.log(area2 / 2 + ':' + numeratorX / (3 * area2) + ',' + numeratorY / (3 * area2));
