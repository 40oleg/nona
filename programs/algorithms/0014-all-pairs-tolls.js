const table = [[0, 6, 20], [Infinity, 0, 4], [2, Infinity, 0]];
for (let k = 0; k < 3; k++) {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) table[i][j] = Math.min(table[i][j], table[i][k] + table[k][j]);
  }
}
const summaries = table.map((row, i) => row.map((cost, j) => i === j ? '-' : cost).join(':'));
if (table[0][2] !== 10) throw new Error('shortcut');
console.log(summaries.join('|'));
