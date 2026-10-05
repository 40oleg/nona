const teams = [["a","b","c"],["b","d"],["c","e","e"]];
const counts = new Map();
for (const team of teams) {
  for (const member of new Set(team)) {
    counts.set(member,(counts.get(member)||0)+1);
  }
}
const exclusive = Array.from(counts).filter(([,n]) => n===1).map(([member]) => member);
exclusive.sort();
console.log(exclusive.join(","));
