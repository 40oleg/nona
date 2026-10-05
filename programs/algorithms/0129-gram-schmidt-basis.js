const vectors = [[1, 1, 0], [1, 0, 1], [0, 1, 1]], basis = [];
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
for (const input of vectors) {
  let residual = input.slice();
  for (const previous of basis) { const scale = dot(residual, previous) / dot(previous, previous); residual = residual.map((value, i) => value - scale * previous[i]); }
  if (dot(residual, residual) > 1e-12) basis.push(residual);
}
for (let i = 0; i < basis.length; i++) for (let j = i + 1; j < basis.length; j++) if (Math.abs(dot(basis[i], basis[j])) > 1e-9) throw new Error('orthogonality');
console.log(basis.length + ':' + basis.map(v => Math.round(dot(v, v) * 1000)).join(','));
