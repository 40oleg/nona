async function main() {
  const sources = [async () => { throw new Error('offline'); }, async () => [], async () => ['book', 'pen']];
  const failures = [];
  let catalog = [];
  for (let i = 0; i < sources.length; i++) {
    try {
      const rows = await sources[i]();
      if (!rows.length) { failures.push('empty:' + i); continue; }
      catalog = rows; break;
    } catch (error) { failures.push(error.message); }
  }
  console.log(JSON.stringify([catalog, failures]));
}
main().catch(error => { throw error; });
