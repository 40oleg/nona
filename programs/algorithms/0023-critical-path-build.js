const stages = [['design', 2, []], ['frame', 5, ['design']], ['wiring', 3, ['design']], ['test', 2, ['frame', 'wiring']]];
const finishes = new Map(), predecessor = new Map();
for (const [name, duration, parents] of stages) {
  let prior = 0, chosen = '';
  for (const p of parents) if (finishes.get(p) > prior) { prior = finishes.get(p); chosen = p; }
  finishes.set(name, prior + duration); predecessor.set(name, chosen);
}
const path = []; let cursor = 'test';
while (cursor) { path.unshift(cursor); cursor = predecessor.get(cursor); }
console.log(finishes.get('test') + ':' + path.join('>'));
