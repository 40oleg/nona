function* brackets(open, close, prefix) {
  if (open === 0 && close === 0) { yield prefix; return; }
  if (open > 0) yield* brackets(open - 1, close, prefix + '(');
  if (close > open) yield* brackets(open, close - 1, prefix + ')');
}
const results = [...brackets(3, 3, '')];
if (results.length !== 5 || new Set(results).size !== 5) throw new Error('Catalan count');
console.log(results.join('|'));
