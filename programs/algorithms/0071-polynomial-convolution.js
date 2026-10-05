const a = [2, -1, 3], b = [1, 4], product = Array(a.length + b.length - 1).fill(0);
for (let i = 0; i < a.length; i++) {
  for (let j = 0; j < b.length; j++) product[i + j] += a[i] * b[j];
}
function evaluate(coefficients, x) { return coefficients.reduceRight((sum, c) => sum * x + c, 0); }
if (evaluate(product, 2) !== evaluate(a, 2) * evaluate(b, 2)) throw new Error('evaluation');
console.log(product.join(','));
