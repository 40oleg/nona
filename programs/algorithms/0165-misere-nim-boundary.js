function winning(piles) {
  const active = piles.filter(n => n > 0);
  if (!active.length) return true;
  if (active.every(n => n === 1)) return active.length % 2 === 0;
  return active.reduce((xor, n) => xor ^ n, 0) !== 0;
}
const scenarios = [[], [1], [1, 1], [1, 1, 1], [2, 2], [2, 1]];
const outcomes = scenarios.map(piles => winning(piles) ? 'win' : 'lose');
console.log(outcomes.join(','));
