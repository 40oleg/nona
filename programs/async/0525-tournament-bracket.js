async function main() {
  let round = [{ name: 'red', score: 7 }, { name: 'blue', score: 4 }, { name: 'gold', score: 9 }, { name: 'green', score: 6 }];
  const winners = [];
  while (round.length > 1) {
    const matches = [];
    for (let i = 0; i < round.length; i += 2) matches.push([round[i], round[i + 1]]);
    round = await Promise.all(matches.map(async ([a, b]) => {
      await Promise.resolve();
      return a.score >= b.score ? a : b;
    }));
    winners.push(round.map(team => team.name));
  }
  console.log(JSON.stringify(winners));
}
main().catch(error => { throw error; });
