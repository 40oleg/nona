const counts = new Map([['A', 2], ['B', 1]]);
function* arrange(prefix, remaining) {
  if (!remaining) { yield prefix; return; }
  for (const [letter, count] of counts) {
    if (!count) continue;
    counts.set(letter, count - 1);
    yield* arrange(prefix + letter, remaining - 1);
    counts.set(letter, count);
  }
}
console.log([...arrange('', 3)].join(','));
