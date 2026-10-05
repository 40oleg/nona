const samples = [[0, 1], [2, 9], [5, 36]];
function evaluate(x) {
  let result = 0;
  for (let i = 0; i < samples.length; i++) {
    let term = samples[i][1];
    for (let j = 0; j < samples.length; j++) if (i !== j) term *= (x - samples[j][0]) / (samples[i][0] - samples[j][0]);
    result += term;
  }
  return result;
}
console.log([1, 3, 4].map(x => Math.round(evaluate(x))).join(','));
