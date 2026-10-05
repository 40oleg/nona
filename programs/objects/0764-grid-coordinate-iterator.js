class Grid {
  constructor(rows) { this.rows = rows; }
  *cells() {
    for (let y = 0; y < this.rows.length; y++) for (let x = 0; x < this.rows[y].length; x++) yield { x, y, value: this.rows[y][x] };
  }
  find(value) { return [...this.cells()].filter(cell => cell.value === value).map(({ x, y }) => [x, y]); }
  get total() { return [...this.cells()].reduce((sum, cell) => sum + cell.value, 0); }
}
const grid = new Grid([[1, 2], [2, 3, 2]]);
console.log(JSON.stringify([grid.find(2), grid.total]));
