const polygon = [[-2, 0], [3, 0], [3, 4], [-2, 4]], clipped = [];
const inside = point => point[0] >= 0;
for (let i = 0; i < polygon.length; i++) {
  const a = polygon[i], b = polygon[(i + 1) % polygon.length];
  if (inside(a) !== inside(b)) { const t = -a[0] / (b[0] - a[0]); clipped.push([0, a[1] + t * (b[1] - a[1])]); }
  if (inside(b)) clipped.push(b);
}
if (clipped.some(([x]) => x < 0)) throw new Error('outside vertex');
console.log(JSON.stringify(clipped));
