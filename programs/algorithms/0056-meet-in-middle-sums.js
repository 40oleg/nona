const left = [2, 4, 7], right = [1, 3, 6], target = 10;
const frequency = new Map();
for (let mask = 0; mask < 1 << left.length; mask++) {
  let sum = 0; for (let i = 0; i < left.length; i++) if (mask & (1 << i)) sum += left[i];
  frequency.set(sum, (frequency.get(sum) || 0) + 1);
}
let matches = 0;
for (let mask = 0; mask < 1 << right.length; mask++) {
  let sum = 0; for (let i = 0; i < right.length; i++) if (mask & (1 << i)) sum += right[i];
  matches += frequency.get(target - sum) || 0;
}
console.log(matches);
