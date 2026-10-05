let values = new Uint32Array([256, 1, 65536, 255, 0, 257]);
for (let shift = 0; shift < 32; shift += 8) {
  const counts = new Uint32Array(256);
  for (const value of values) counts[(value >>> shift) & 255]++;
  let position = 0; for (let i = 0; i < 256; i++) { const n = counts[i]; counts[i] = position; position += n; }
  const output = new Uint32Array(values.length);
  for (const value of values) output[counts[(value >>> shift) & 255]++] = value;
  values = output;
}
console.log(Array.from(values).join(','));
