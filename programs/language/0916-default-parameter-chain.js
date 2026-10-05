function interval(start = 0, end = start+3, step = end > start ? 1 : -1) {
  const result = [];
  for (let value = start; step > 0 ? value < end : value > end; value += step) result.push(value);
  return result;
}
const examples = [interval(),interval(4),interval(5,1),interval(0,6,2)];
const [defaulted,...custom] = examples;
console.log(JSON.stringify({defaulted,custom}));
const lengths = examples.map(values => values.length);
console.log(lengths.join(','));
