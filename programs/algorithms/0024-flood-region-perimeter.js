const land = ['110', '100', '011']; const seen = new Set();
let area = 0, perimeter = 0;
function fill(x, y) {
  const key = x + ',' + y;
  if (seen.has(key)) return;
  seen.add(key); area++;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= 3 || ny < 0 || ny >= 3 || land[ny][nx] !== '1') perimeter++;
    else fill(nx, ny);
  }
}
fill(0, 0); console.log(area + ':' + perimeter);
