const parked = new Map(), events = [['in', 'a'], ['in', 'b'], ['in', 'a'], ['in', 'c'], ['out', 'a'], ['in', 'c'], ['out', 'x']];
const results = []; let serial = 0;
for (const [kind, car] of events) {
  if (kind === 'out') { results.push(car + ':' + (parked.delete(car) ? 'left' : 'missing')); continue; }
  if (parked.has(car)) results.push(car + ':duplicate');
  else if (parked.size === 2) results.push(car + ':full');
  else { parked.set(car, ++serial); results.push(car + ':ticket' + serial); }
}
console.log(results.join('|') + ';remaining=' + parked.size);
