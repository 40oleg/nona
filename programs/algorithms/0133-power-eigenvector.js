const matrix = [[2, 1], [1, 2]]; let vector = [1, 0];
for (let step = 0; step < 12; step++) {
  const product = matrix.map(row => row.reduce((sum, value, i) => sum + value * vector[i], 0));
  const norm = Math.sqrt(product.reduce((sum, x) => sum + x * x, 0)); vector = product.map(x => x / norm);
}
const mv = matrix.map(row => row.reduce((sum, x, i) => sum + x * vector[i], 0));
const eigenvalue = mv.reduce((sum, x, i) => sum + x * vector[i], 0);
console.log(Math.round(eigenvalue * 1000) + ':' + vector.map(x => Math.round(x * 1000)).join(','));
