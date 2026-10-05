let x = 0, y = 0; const targetX = 5, targetY = 3;
const dx = Math.abs(targetX - x), dy = -Math.abs(targetY - y), sx = 1, sy = 1;
let error = dx + dy; const pixels = [];
while (true) {
  pixels.push([x, y]); if (x === targetX && y === targetY) break;
  const doubled = 2 * error;
  if (doubled >= dy) { error += dy; x += sx; }
  if (doubled <= dx) { error += dx; y += sy; }
}
console.log(JSON.stringify(pixels));
