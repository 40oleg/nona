async function main() {
  const live = { count: 5, version: 1 };
  const snapshot = { ...live };
  const writer = Promise.resolve().then(() => { live.count = 9; live.version++; });
  async function readSnapshot() {
    const first = snapshot.count;
    await writer;
    return [first, snapshot.count, snapshot.version];
  }
  const observed = await readSnapshot();
  console.log(JSON.stringify([observed, live]));
}
main().catch(error => { throw error; });
