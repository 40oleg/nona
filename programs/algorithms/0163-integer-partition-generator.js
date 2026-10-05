function* partition(remaining, maximum, prefix) {
  if (remaining === 0) { yield prefix; return; }
  for (let part = Math.min(remaining, maximum); part >= 1; part--) yield* partition(remaining - part, part, [...prefix, part]);
}
const parts = [...partition(5, 5, [])];
for (const row of parts) {
  if (row.reduce((a, b) => a + b, 0) !== 5 || row.some((n, i) => i > 0 && n > row[i - 1])) throw new Error('partition invariant');
}
console.log(parts.map(row => row.join('+')).join('|'));
