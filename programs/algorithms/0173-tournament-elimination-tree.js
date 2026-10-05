let round = [5, 9, 2, 7, 8, 1, 6, 4].map(value => ({value, defeated: []}));
while (round.length > 1) {
  const next = [];
  for (let i = 0; i < round.length; i += 2) {
    const a = round[i], b = round[i + 1], winner = a.value > b.value ? a : b, loser = winner === a ? b : a;
    next.push({value: winner.value, defeated: [...winner.defeated, loser.value]});
  }
  round = next;
}
const champion = round[0], runnerUp = Math.max(...champion.defeated);
console.log(champion.value + ':' + runnerUp + ':' + champion.defeated.join(','));
