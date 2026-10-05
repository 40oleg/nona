const matrix = [[2, 1, 3], [1, 0, 2], [4, 1, 8]]; let previous = 1;
for (let k = 0; k < matrix.length - 1; k++) {
  const pivot = matrix[k][k];
  if (!pivot) throw new Error('pivot required');
  for (let i = k + 1; i < matrix.length; i++) for (let j = k + 1; j < matrix.length; j++) {
    const numerator = matrix[i][j] * pivot - matrix[i][k] * matrix[k][j];
    if (numerator % previous) throw new Error('fraction-free invariant');
    matrix[i][j] = numerator / previous;
  }
  previous = pivot;
}
console.log(matrix[2][2]);
