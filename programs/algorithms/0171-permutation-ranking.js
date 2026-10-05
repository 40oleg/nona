const permutation = ['c', 'a', 'd', 'b'], available = ['a', 'b', 'c', 'd'];
const factorial = [1, 1, 2, 6, 24]; let rank = 0;
for (let i = 0; i < permutation.length; i++) {
  const index = available.indexOf(permutation[i]); if (index < 0) throw new Error('duplicate token');
  rank += index * factorial[permutation.length - i - 1]; available.splice(index, 1);
}
if (rank < 0 || rank >= factorial[4]) throw new Error('rank range');
console.log(rank);
