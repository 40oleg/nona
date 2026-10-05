const walls = new Set(['1,0', '1,1']), goal = [3, 2];
const frontier = [[0, 0, 0]], best = new Map([['0,0', 0]]); let answer = -1;
while (frontier.length) {
  frontier.sort((a, b) => (a[2] + 5 - a[0] - a[1]) - (b[2] + 5 - b[0] - b[1]));
  const [x, y, cost] = frontier.shift();
  if (best.get(x + ',' + y) !== cost) continue;
  if (x === goal[0] && y === goal[1]) { answer = cost; break; }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy, key = nx + ',' + ny;
    if (nx < 0 || nx > 3 || ny < 0 || ny > 2 || walls.has(key)) continue;
    if (cost + 1 < (best.get(key) ?? Infinity)) { best.set(key, cost + 1); frontier.push([nx, ny, cost + 1]); }
  }
}
console.log(answer);
