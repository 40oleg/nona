const neighbors = new Map([['a', ['b', 'c']], ['b', ['a', 'c']], ['c', ['a', 'b']]]);
const color = new Map([['a', 0]]), queue = ['a']; let conflict = '';
for (let head = 0; head < queue.length && !conflict; head++) {
  const current = queue[head];
  for (const next of neighbors.get(current)) {
    if (!color.has(next)) { color.set(next, 1 - color.get(current)); queue.push(next); }
    else if (color.get(next) === color.get(current)) { conflict = current + next; break; }
  }
}
if (!conflict) throw new Error('odd cycle missed');
console.log('conflict:' + conflict);
