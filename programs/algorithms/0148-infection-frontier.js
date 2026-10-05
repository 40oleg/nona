const contacts = new Map([['a', ['b']], ['b', ['a', 'c', 'd']], ['c', ['b', 'e']], ['d', ['b']], ['e', ['c']]]);
let frontier = new Set(['a']); const infected = new Set(frontier), waves = [];
while (frontier.size) {
  waves.push([...frontier].sort().join('')); const next = new Set();
  for (const person of frontier) for (const contact of contacts.get(person)) if (!infected.has(contact)) next.add(contact);
  for (const person of next) infected.add(person);
  frontier = next;
}
console.log(waves.join('>') + ':' + infected.size);
