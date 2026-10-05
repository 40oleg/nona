function* phrases(parts, prefix = '') {
  if (!parts.length) { yield prefix.trim(); return; }
  const [head,...tail] = parts;
  for (const choice of head) yield* phrases(tail,prefix+choice+' ');
}
const grammar = [['red','blue'],['bird','boat'],['arrives']];
const iterator = phrases(grammar);
const first = iterator.next().value;
const remaining = [...iterator];
console.log(JSON.stringify({first,remaining}));
