const a = 'caress', b = 'acress';
const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
for (let i = 1; i <= a.length; i++) {
  for (let j = 1; j <= b.length; j++) {
    matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
  }
}
console.log(matrix[a.length][b.length]);
