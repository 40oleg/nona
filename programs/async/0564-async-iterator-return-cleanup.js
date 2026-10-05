async function main() {
  const trace = [];
  async function* resource() {
    try { yield 'open'; yield 'unused'; }
    finally { await Promise.resolve(); trace.push('disposed'); }
  }
  const iterator = resource();
  const first = await iterator.next();
  const closed = await iterator.return('stopped');
  const after = await iterator.next();
  console.log(JSON.stringify([first.value, closed.value, after.done, trace]));
}
main().catch(error => { throw error; });
