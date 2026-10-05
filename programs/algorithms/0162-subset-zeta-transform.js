const original = new Int32Array([1, 2, 3, 4, 5, 6, 7, 8]), sums = original.slice();
for (let bit = 0; bit < 3; bit++) {
  for (let mask = 0; mask < 8; mask++) if (mask & (1 << bit)) sums[mask] += sums[mask ^ (1 << bit)];
}
const restored = sums.slice();
for (let bit = 0; bit < 3; bit++) {
  for (let mask = 0; mask < 8; mask++) if (mask & (1 << bit)) restored[mask] -= restored[mask ^ (1 << bit)];
}
if (!restored.every((value, i) => value === original[i])) throw new Error('Mobius inversion');
console.log(Array.from(sums).join(','));
