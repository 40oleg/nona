async function main() {
  const checkpoint = { offset: 0 };
  const stored = [];
  async function* feed(start) {
    for (let offset = start; offset < 5; offset++) yield await Promise.resolve({ offset, value: 'r' + offset });
  }
  for await (const record of feed(checkpoint.offset)) {
    stored.push(record.value); checkpoint.offset = record.offset + 1;
    if (stored.length === 2) break;
  }
  for await (const record of feed(checkpoint.offset)) { stored.push(record.value); checkpoint.offset = record.offset + 1; }
  console.log(JSON.stringify([stored, checkpoint.offset]));
}
main().catch(error => { throw error; });
