async function main() {
  const assignments = await Promise.all([Promise.resolve(2), Promise.resolve(0), Promise.resolve(3), Promise.resolve(1)]);
  const seen = new Set(assignments);
  const inRange = assignments.every(position => Number.isInteger(position) && position >= 0 && position < assignments.length);
  if (!inRange || seen.size !== assignments.length) throw new Error('invalid permutation');
  const labels = ['a', 'b', 'c', 'd'];
  const placed = Array(labels.length);
  for (let i = 0; i < labels.length; i++) placed[assignments[i]] = labels[i];
  console.log(placed.join(''));
}
main().catch(error => { throw error; });
