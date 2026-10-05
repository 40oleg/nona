async function main() {
  const grid = ['..#', '.##', '...'];
  const queue = [[0, 0]];
  const filled = new Set(['0,0']);
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [nx, ny] = await Promise.resolve([x + dx, y + dy]);
      const key = nx + ',' + ny;
      if (ny >= 0 && ny < grid.length && nx >= 0 && nx < 3 && grid[ny][nx] === '.' && !filled.has(key)) { filled.add(key); queue.push([nx, ny]); }
    }
  }
  console.log(JSON.stringify(Array.from(filled)));
}
main().catch(error => { throw error; });
