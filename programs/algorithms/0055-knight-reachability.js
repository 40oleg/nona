const offsets = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
let positions = new Set(['0,0']);
for (let turn = 0; turn < 2; turn++) {
  const next = new Set();
  for (const key of positions) {
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of offsets) if (x + dx >= 0 && x + dx < 5 && y + dy >= 0 && y + dy < 5) next.add((x + dx) + ',' + (y + dy));
  }
  positions = next;
}
console.log([...positions].sort().join(';'));
