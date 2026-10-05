async function main() {
  const backups = [
    { id: 'a', epoch: 1, revision: 1, pinned: false },
    { id: 'b', epoch: 1, revision: 2, pinned: false },
    { id: 'c', epoch: 2, revision: 3, pinned: true },
    { id: 'd', epoch: 2, revision: 4, pinned: false },
    { id: 'e', epoch: 3, revision: 5, pinned: false }
  ];
  backups.sort((a, b) => b.revision - a.revision);
  const epochs = new Set();
  const kept = [];
  const deleted = [];
  for (const snapshot of backups) {
    const required = snapshot.pinned || !epochs.has(snapshot.epoch);
    if (required) { kept.push(snapshot.id); epochs.add(snapshot.epoch); }
    else deleted.push(await Promise.resolve(snapshot.id));
  }
  console.log(JSON.stringify([kept, deleted]));
}
main().catch(error => { throw error; });
