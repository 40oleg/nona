const augmented = [[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]], n = 3;
for (let col = 0; col < n; col++) {
  let pivot = col; for (let r = col + 1; r < n; r++) if (Math.abs(augmented[r][col]) > Math.abs(augmented[pivot][col])) pivot = r;
  [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
  if (augmented[col][col] === 0) throw new Error('singular');
  for (let row = col + 1; row < n; row++) { const factor = augmented[row][col] / augmented[col][col]; for (let j = col; j <= n; j++) augmented[row][j] -= factor * augmented[col][j]; }
}
const x = Array(n).fill(0);
for (let i = n - 1; i >= 0; i--) { let rhs = augmented[i][n]; for (let j = i + 1; j < n; j++) rhs -= augmented[i][j] * x[j]; x[i] = rhs / augmented[i][i]; }
console.log(x.map(v => Math.round(v)).join(','));
