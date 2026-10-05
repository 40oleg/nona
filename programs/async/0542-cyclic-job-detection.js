async function main() {
  const graph = new Map([['a', ['b']], ['b', ['a']], ['ready', []]]);
  const done = new Set();
  let stalled = false;
  while (done.size < graph.size) {
    const runnable = Array.from(graph).filter(([id, deps]) => !done.has(id) && deps.every(dep => done.has(dep)));
    if (!runnable.length) { stalled = true; break; }
    for (const [id] of runnable) { await Promise.resolve(); done.add(id); }
  }
  const blocked = Array.from(graph.keys()).filter(id => !done.has(id));
  console.log(JSON.stringify([Array.from(done), stalled, blocked]));
}
main().catch(error => { throw error; });
