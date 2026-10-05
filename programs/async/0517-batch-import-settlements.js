async function main() {
  const rows = ['alice:3', 'bob:x', 'cara:5'];
  async function parse(row) {
    const [name, raw] = row.split(':');
    await Promise.resolve();
    const count = Number(raw);
    if (!Number.isFinite(count)) throw new Error(name + ':invalid');
    return name + ':' + count * 2;
  }
  const settled = await Promise.allSettled(rows.map(parse));
  const report = settled.map(r => r.status === 'fulfilled' ? r.value : r.reason.message);
  console.log(JSON.stringify(report));
}
main().catch(error => { throw error; });
