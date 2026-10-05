async function main() {
  const cache = new Map([['a', 1], ['b', 2]]);
  async function read(key) {
    const value = await Promise.resolve(cache.get(key));
    if (cache.has(key)) { cache.delete(key); cache.set(key, value); }
    return value;
  }
  await read('a');
  cache.set('c', 3);
  if (cache.size > 2) cache.delete(cache.keys().next().value);
  console.log(JSON.stringify(Array.from(cache)));
}
main().catch(error => { throw error; });
