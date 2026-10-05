const rows = [[4, 7, 1, 0], [2, 6, 0, 1]], n = 2;
for (let pivot = 0; pivot < n; pivot++) {
  const scale = rows[pivot][pivot]; if (!scale) throw new Error('singular');
  for (let c = 0; c < n * 2; c++) rows[pivot][c] /= scale;
  for (let r = 0; r < n; r++) if (r !== pivot) { const factor = rows[r][pivot]; for (let c = 0; c < n * 2; c++) rows[r][c] -= factor * rows[pivot][c]; }
}
const inverse = rows.map(row => row.slice(n).map(value => Math.round(value * 1000) / 1000));
console.log(JSON.stringify(inverse));
