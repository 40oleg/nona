const grid = [[1, 0, 0], [0, 3, 0], [0, 0, 2]];
function solve(cell) {
  if (cell === 9) return true;
  const row = Math.floor(cell / 3), col = cell % 3;
  if (grid[row][col]) return solve(cell + 1);
  for (let value = 1; value <= 3; value++) {
    if (grid[row].includes(value) || grid.some(line => line[col] === value)) continue;
    grid[row][col] = value; if (solve(cell + 1)) return true; grid[row][col] = 0;
  }
  return false;
}
console.log(solve(0) ? JSON.stringify(grid) : 'no solution');
