const words = new Int32Array([0, -1, -2147483648, 0x1234]);
const counts = [];
for (const word of words) {
  let bits = word >>> 0, count = 0;
  while (bits) { bits = (bits & (bits - 1)) >>> 0; count++; }
  counts.push(count);
}
if (counts[1] !== 32 || counts[2] !== 1) throw new Error('signed width');
console.log(counts.join(','));
