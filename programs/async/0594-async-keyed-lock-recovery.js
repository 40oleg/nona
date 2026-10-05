async function main() {
  let tail = Promise.resolve();
  const log = [];
  function exclusive(action) {
    const result = tail.then(action);
    tail = result.catch(() => undefined);
    return result;
  }
  const failed = exclusive(async () => { log.push('bad'); throw new Error('denied'); });
  const succeeded = exclusive(async () => { await Promise.resolve(); log.push('good'); return 7; });
  try { await failed; } catch (error) { log.push(error.message); }
  const value = await succeeded;
  console.log(JSON.stringify([value, log]));
}
main().catch(error => { throw error; });
