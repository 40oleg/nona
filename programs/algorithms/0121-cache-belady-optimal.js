const trace = ['a', 'b', 'c', 'a', 'd', 'b', 'a'], cache = new Set(), capacity = 2;
let misses = 0; const victims = [];
for (let i = 0; i < trace.length; i++) {
  if (cache.has(trace[i])) continue;
  misses++;
  if (cache.size === capacity) {
    let victim, furthest = -1;
    for (const item of cache) { const next = trace.indexOf(item, i + 1), distance = next < 0 ? Infinity : next; if (distance > furthest) { victim = item; furthest = distance; } }
    cache.delete(victim); victims.push(victim);
  }
  cache.add(trace[i]);
}
console.log(misses + ':' + victims.join(','));
