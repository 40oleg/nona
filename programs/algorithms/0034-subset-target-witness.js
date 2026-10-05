let reachable = new Map([[0, []]]);
const values = [7, -3, 5, 2], target = 4;
for (let index = 0; index < values.length; index++) {
  const additions = [];
  for (const [sum, indices] of reachable) if (!reachable.has(sum + values[index])) additions.push([sum + values[index], [...indices, index]]);
  for (const [sum, indices] of additions) if (!reachable.has(sum)) reachable.set(sum, indices);
}
const witness = reachable.get(target);
if (!witness || witness.reduce((sum, i) => sum + values[i], 0) !== target) throw new Error('subset');
console.log(witness.join(','));
