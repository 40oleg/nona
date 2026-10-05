async function main() {
  async function* worker() {
    try { yield 'ready'; }
    catch (error) { yield 'handled:' + error.message; }
    yield 'continued';
  }
  const iterator = worker();
  const first = await iterator.next();
  const handled = await iterator.throw(new Error('pause'));
  const next = await iterator.next();
  const last = await iterator.next();
  console.log(JSON.stringify([first.value, handled.value, next.value, last.done]));
}
main().catch(error => { throw error; });
