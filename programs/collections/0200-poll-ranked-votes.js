const candidates = ["oak","elm","ash"];
const ballots = [["elm","oak"],["oak","ash"],["elm"],["ash","oak"],["oak","elm"]];
const tally = new Map(candidates.map(name => [name,0]));
for (const ballot of ballots) {
  if (ballot.length) tally.set(ballot[0],tally.get(ballot[0])+1);
}
const ranking = Array.from(tally);
ranking.sort((a,b) => b[1]-a[1] || candidates.indexOf(a[0])-candidates.indexOf(b[0]));
const winner = ranking[0][0];
console.log(JSON.stringify({ranking,winner}));
