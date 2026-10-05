const grains = new Int32Array([0, 0, 20, 0, 0]); let lost = 0, topples = 0;
while (grains.some(x => x >= 2)) {
  for (let i = 0; i < grains.length; i++) {
    if (grains[i] < 2) continue;
    grains[i] -= 2; topples++;
    if (i > 0) grains[i - 1]++; else lost++;
    if (i + 1 < grains.length) grains[i + 1]++; else lost++;
  }
}
if (grains.reduce((a, b) => a + b, 0) + lost !== 20) throw new Error('grain conservation');
console.log(Array.from(grains).join(',') + ':' + lost + ':' + topples);
