const changes = [2, -2, 0, 3, -3], counts = new Map([[0, 1]]);
let balance = 0, intervals = 0;
for (const change of changes) {
  balance += change;
  const prior = counts.get(balance) ?? 0;
  intervals += prior; counts.set(balance, prior + 1);
}
if (intervals !== 6) throw new Error('prefix multiplicity');
console.log(intervals + ':' + [...counts].map(([sum, n]) => sum + '=' + n).join(','));
