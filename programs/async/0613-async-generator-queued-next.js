async function main() {
  const trace = [];
  async function* generator() {
    for (const value of [1, 2, 3]) {
      trace.push('start:' + value);
      yield await Promise.resolve(value * 10);
    }
  }
  const iterator = generator();
  const requests = [iterator.next(), iterator.next(), iterator.next(), iterator.next()];
  const results = await Promise.all(requests);
  console.log(JSON.stringify([results.map(result => result.done ? 'end' : result.value), trace]));
}
main().catch(error => { throw error; });
