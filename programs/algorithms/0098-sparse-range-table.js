const values = [8, 6, 7, 3, 9, 2, 5], table = [values.slice()];
for (let power = 1; (1 << power) <= values.length; power++) {
  const row = [], half = 1 << (power - 1);
  for (let i = 0; i + (1 << power) <= values.length; i++) row.push(Math.min(table[power - 1][i], table[power - 1][i + half]));
  table.push(row);
}
function query(left, right) { const power = Math.floor(Math.log2(right - left)); return Math.min(table[power][left], table[power][right - (1 << power)]); }
console.log(query(0, 4) + ',' + query(2, 7) + ',' + query(4, 5));
