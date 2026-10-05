let x = 4, y = 0, decision = 1 - x; const pixels = new Set();
while (x >= y) {
  for (const [a, b] of [[x, y], [y, x], [-x, y], [-y, x], [x, -y], [y, -x], [-x, -y], [-y, -x]]) pixels.add(a + ',' + b);
  y++;
  if (decision < 0) decision += 2 * y + 1;
  else { x--; decision += 2 * (y - x) + 1; }
}
if (!pixels.has('4,0') || !pixels.has('0,-4')) throw new Error('symmetry');
console.log(pixels.size);
