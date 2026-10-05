const rows = [[1, 4, 9, 16, 25]];
while (rows[rows.length - 1].length > 1) {
  const prior = rows[rows.length - 1], differences = [];
  for (let i = 1; i < prior.length; i++) differences.push(prior[i] - prior[i - 1]);
  rows.push(differences);
  if (differences.every(x => x === differences[0])) break;
}
let next = rows[rows.length - 1][0];
for (let depth = rows.length - 2; depth >= 0; depth--) next += rows[depth][rows[depth].length - 1];
console.log(next + ':' + rows.map(row => row.join(',')).join('|'));
