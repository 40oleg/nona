function* samples() { yield ['north', 8]; yield ['south', 2]; yield ['east', 6]; yield ['west', 1]; yield ['center', 5]; }
const reservoir = [], capacity = 2; let considered = 0;
for (const [name, priority] of samples()) {
  considered++; reservoir.push({name, priority}); reservoir.sort((a, b) => b.priority - a.priority);
  if (reservoir.length > capacity) reservoir.shift();
}
reservoir.sort((a, b) => a.priority - b.priority);
if (reservoir.length !== capacity || reservoir[1].priority !== 2) throw new Error('priority cutoff');
console.log(considered + ':' + reservoir.map(sample => sample.name).join(','));
