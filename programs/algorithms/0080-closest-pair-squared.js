const points = [[0, 0], [8, 1], [3, 3], [3, 4], [-2, 5]].sort((a, b) => a[0] - b[0]);
let distance2 = Infinity, pair = [];
for (let i = 0; i < points.length; i++) {
  for (let j = i + 1; j < points.length; j++) {
    const dx = points[j][0] - points[i][0]; if (dx * dx > distance2) break;
    const dy = points[j][1] - points[i][1], candidate = dx * dx + dy * dy;
    if (candidate < distance2) { distance2 = candidate; pair = [points[i], points[j]]; }
  }
}
console.log(distance2 + ':' + JSON.stringify(pair));
