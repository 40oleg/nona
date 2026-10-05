async function main() {
  let fetches = 0;
  async function* catalog() {
    for (const page of [['a', 'b'], ['c', 'd'], ['e']]) {
      fetches++;
      const rows = await Promise.resolve(page);
      for (const row of rows) yield row;
    }
  }
  const wanted = [];
  for await (const row of catalog()) { wanted.push(row); if (wanted.length === 3) break; }
  console.log(JSON.stringify([wanted, fetches]));
}
main().catch(error => { throw error; });
