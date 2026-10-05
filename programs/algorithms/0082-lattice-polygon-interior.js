const points = [[0, 0], [6, 0], [0, 4]];
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
let area2 = 0, border = 0;
for (let i = 0; i < points.length; i++) {
  const [x, y] = points[i], [u, v] = points[(i + 1) % points.length];
  area2 += x * v - y * u; border += gcd(u - x, v - y);
}
const interior = (Math.abs(area2) - border + 2) / 2;
console.log(interior + ':' + border);
