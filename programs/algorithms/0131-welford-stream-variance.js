function* readings() { yield 1000001; yield 1000002; yield 1000003; yield 1000004; }
let count = 0, mean = 0, m2 = 0;
for (const value of readings()) {
  count++; const delta = value - mean; mean += delta / count; m2 += delta * (value - mean);
}
if (mean !== 1000002.5 || m2 !== 5) throw new Error('stable moments');
console.log(count + ':' + mean + ':' + m2 / count);
