let sums = new Map([[0, 1]]);
for (let die = 0; die < 3; die++) {
  const next = new Map();
  for (const [sum, ways] of sums) for (let face = 1; face <= 4; face++) next.set(sum + face, (next.get(sum + face) || 0) + ways);
  sums = next;
}
let total = 0; for (const count of sums.values()) total += count;
if (total !== 64) throw new Error('sample space');
console.log([...sums].map(([sum, count]) => sum + ':' + count).join(','));
