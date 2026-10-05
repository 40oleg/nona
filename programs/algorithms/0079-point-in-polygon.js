const boundary = [[0, 0], [4, 0], [4, 4], [2, 2], [0, 4]];
function classify([x, y]) {
  let winding = 0;
  for (let i = 0; i < boundary.length; i++) {
    const [ax, ay] = boundary[i], [bx, by] = boundary[(i + 1) % boundary.length];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (!cross && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return 'edge';
    if (ay <= y && by > y && cross > 0) winding++; else if (ay > y && by <= y && cross < 0) winding--;
  }
  return winding ? 'inside' : 'outside';
}
console.log([[1, 1], [2, 3], [4, 2]].map(classify).join(','));
