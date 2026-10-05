async function main() {
  let locked = false;
  const log = [];
  async function withLease(action) {
    if (locked) throw new Error('locked');
    locked = true;
    try { return await action(); }
    finally { locked = false; log.push('released'); }
  }
  try { await withLease(() => Promise.reject(new Error('write failed'))); }
  catch (error) { log.push(error.message); }
  log.push(await withLease(async () => 'read ok'));
  console.log(JSON.stringify([locked, log]));
}
main().catch(error => { throw error; });
