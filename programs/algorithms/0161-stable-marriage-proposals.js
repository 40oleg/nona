const preferences = [[0, 1, 2], [0, 2, 1], [1, 0, 2]], rankings = [[1, 0, 2], [0, 2, 1], [2, 1, 0]];
const next = [0, 0, 0], partner = [-1, -1, -1], free = [0, 1, 2];
while (free.length) {
  const person = free.shift(), choice = preferences[person][next[person]++], incumbent = partner[choice];
  if (incumbent < 0) partner[choice] = person;
  else if (rankings[choice].indexOf(person) < rankings[choice].indexOf(incumbent)) { partner[choice] = person; free.push(incumbent); }
  else free.push(person);
}
for (let person = 0; person < 3; person++) {
  const own = partner.indexOf(person);
  for (const choice of preferences[person]) { if (choice === own) break; if (rankings[choice].indexOf(person) < rankings[choice].indexOf(partner[choice])) throw new Error('blocking pair'); }
}
console.log(partner.join(','));
