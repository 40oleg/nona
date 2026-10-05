async function main() {
  const journal = [
    { type: 'prepare', tx: 'a', delta: 8 },
    { type: 'prepare', tx: 'b', delta: -4 },
    { type: 'commit', tx: 'a' },
    { type: 'commit', tx: 'a' },
    { type: 'abort', tx: 'b' },
    { type: 'prepare', tx: 'c', delta: 6 }
  ];
  async function* recoverRecords() {
    for (const record of journal) yield await Promise.resolve(record);
  }
  const pending = new Map();
  const committed = new Set();
  let balance = 20;
  for await (const record of recoverRecords()) {
    if (record.type === 'prepare') pending.set(record.tx, record.delta);
    else if (record.type === 'abort') pending.delete(record.tx);
    else if (!committed.has(record.tx)) {
      if (!pending.has(record.tx)) throw new Error('commit without preparation');
      balance += pending.get(record.tx);
      pending.delete(record.tx);
      committed.add(record.tx);
    }
  }
  const abandoned = Array.from(pending.keys());
  pending.clear();
  console.log(JSON.stringify([balance, Array.from(committed), abandoned]));
}
main().catch(error => { throw error; });
