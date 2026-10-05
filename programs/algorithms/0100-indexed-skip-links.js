const nodes = [1, 3, 5, 7, 9, 11].map(value => ({value, next: null, skip: null}));
nodes.forEach((node, i) => { node.next = nodes[i + 1] || null; node.skip = nodes[i + 2] || null; });
let cursor = nodes[0], probes = [cursor.value], target = 9;
while (cursor.value < target) {
  const next = cursor.skip && cursor.skip.value <= target ? cursor.skip : cursor.next;
  if (!next) break;
  cursor = next; probes.push(cursor.value);
}
console.log((cursor.value === target) + ':' + probes.join('>'));
