const columns = new Set(), rising = new Set(), falling = new Set(), board = [], solutions = [];
function place(row) {
  if (row === 4) { solutions.push([...board]); return; }
  for (let col = 0; col < 4; col++) {
    if (columns.has(col) || rising.has(row + col) || falling.has(row - col)) continue;
    columns.add(col); rising.add(row + col); falling.add(row - col); board.push(col);
    try { place(row + 1); }
    finally { columns.delete(col); rising.delete(row + col); falling.delete(row - col); board.pop(); }
  }
}
place(0); console.log(JSON.stringify(solutions));
