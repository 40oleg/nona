let alive = new Set(['1,2', '2,2', '3,2']);
function step(cells) {
  const counts = new Map();
  for (const key of cells) { const [x, y] = key.split(',').map(Number); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) { const k = (x + dx) + ',' + (y + dy); counts.set(k, (counts.get(k) || 0) + 1); } }
  const next = new Set();
  for (const [key, count] of counts) if (count === 3 || count === 2 && cells.has(key)) next.add(key);
  return next;
}
const first = step(alive), second = step(first);
if ([...second].sort().join(';') !== [...alive].sort().join(';')) throw new Error('oscillator period');
console.log([...first].sort().join(';'));
