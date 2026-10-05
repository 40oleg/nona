let active = new Map([[2, 1]]), left = 0, right = 0;
for (let step = 0; step < 6; step++) {
  const next = new Map();
  for (const [position, mass] of active) {
    for (const destination of [position - 1, position + 1]) {
      if (destination === 0) left += mass / 2; else if (destination === 4) right += mass / 2;
      else next.set(destination, (next.get(destination) || 0) + mass / 2);
    }
  }
  active = next;
}
console.log(left + ':' + right + ':' + [...active.values()].reduce((a, b) => a + b, 0));
