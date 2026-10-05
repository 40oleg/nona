async function main() {
  let arrivals = 0;
  let resolve;
  let gate = new Promise(done => { resolve = done; });
  const log = [];
  async function meet(name, phase) {
    const current = gate;
    log.push(name + ':' + phase);
    if (++arrivals === 2) { arrivals = 0; const release = resolve; gate = new Promise(done => { resolve = done; }); release(); }
    await current;
  }
  async function worker(name) { await meet(name, 1); await meet(name, 2); }
  await Promise.all([worker('a'), worker('b')]);
  console.log(log.join(','));
}
main().catch(error => { throw error; });
