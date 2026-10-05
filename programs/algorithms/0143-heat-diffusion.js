let heat = new Float64Array([0, 0, 8, 0, 0]);
for (let tick = 0; tick < 4; tick++) {
  const next = new Float64Array(heat.length);
  for (let i = 0; i < heat.length; i++) {
    const left = i ? heat[i - 1] : heat[i], right = i + 1 < heat.length ? heat[i + 1] : heat[i];
    next[i] = heat[i] + 0.25 * (left + right - 2 * heat[i]);
  }
  heat = next;
}
if (heat.reduce((a, b) => a + b, 0) !== 8) throw new Error('heat conservation');
console.log(Array.from(heat, x => x * 128).join(','));
