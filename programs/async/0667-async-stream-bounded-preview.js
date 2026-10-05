async function main() {
  async function* report() { for (const row of ['a', 'b', 'c', 'd']) yield await Promise.resolve(row); }
  const iterator = report();
  const preview = [];
  let ended = false;
  for (let count = 0; count < 2; count++) {
    const result = await iterator.next();
    if (result.done) { ended = true; break; }
    preview.push(result.value);
  }
  const extra = ended ? { done: true } : await iterator.next();
  await iterator.return();
  console.log(JSON.stringify([preview, !extra.done]));
}
main().catch(error => { throw error; });
