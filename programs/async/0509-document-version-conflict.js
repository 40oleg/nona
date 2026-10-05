async function main() {
  let document = { version: 1, title: 'draft' };
  const snapshot = { ...document };
  async function save(base, title) {
    await Promise.resolve();
    if (base.version !== document.version) throw new Error('conflict');
    document = { version: base.version + 1, title };
  }
  await save(snapshot, 'approved');
  let result = '';
  try { await save(snapshot, 'stale'); }
  catch (error) { result = error.message; }
  console.log(JSON.stringify([document, result]));
}
main().catch(error => { throw error; });
