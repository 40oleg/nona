const source = 'kitten', target = 'sitting';
let previous = Array.from({length: target.length + 1}, (_, j) => j);
for (let i = 1; i <= source.length; i++) {
  const current = [i];
  for (let j = 1; j <= target.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (source[i - 1] === target[j - 1] ? 0 : 1));
  previous = current;
}
const result = previous[target.length];
if (result !== 3) throw new Error('distance');
console.log(result);
