function majority(values) {
  let candidate, balance = 0;
  for (const value of values) { if (!balance) candidate = value; balance += value === candidate ? 1 : -1; }
  const count = values.filter(value => value === candidate).length;
  return count > values.length / 2 ? String(candidate) : 'none';
}
const withMajority = [2, 1, 2, 3, 2, 2], balanced = [1, 2, 3, 1, 2, 3];
if (majority([]) !== 'none') throw new Error('empty majority');
console.log(majority(withMajority) + ':' + majority(balanced) + ':' + majority([]));
