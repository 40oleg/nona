const clocks = [[2, 3], [3, 5], [2, 7]];
let time = 0, period = 1;
for (const [residue, modulus] of clocks) {
  while (time % modulus !== residue) time += period;
  period *= modulus;
}
if (!clocks.every(([r, m]) => time % m === r)) throw new Error('synchronization');
console.log(time + '/' + period);
