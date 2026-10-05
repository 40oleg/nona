async function main() {
  async function* records() { for (const id of [1, 2, 3, 4, 5]) yield await Promise.resolve(id); }
  async function* batches(input) {
    let batch = [];
    for await (const record of input) {
      batch.push(record);
      if (batch.length === 2) { yield batch; batch = []; }
    }
    if (batch.length) yield batch;
  }
  const output = [];
  for await (const batch of batches(records())) output.push(batch);
  console.log(JSON.stringify(output));
}
main().catch(error => { throw error; });
