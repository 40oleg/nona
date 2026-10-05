async function main() {
  async function* segment(prefix, count) {
    for (let i = 1; i <= count; i++) yield await Promise.resolve(prefix + i);
  }
  async function* route() {
    yield 'start';
    yield* segment('north-', 2);
    yield* segment('south-', 1);
    yield 'end';
  }
  const stops = [];
  for await (const stop of route()) stops.push(stop);
  console.log(stops.join('/'));
}
main().catch(error => { throw error; });
