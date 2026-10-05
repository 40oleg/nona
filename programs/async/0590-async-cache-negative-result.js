async function main() {
  const cache = new Map();
  let calls = 0;
  async function find(key) {
    if (cache.has(key)) return cache.get(key);
    calls++;
    const result = await Promise.resolve(key === 'known' ? 17 : undefined);
    cache.set(key, result);
    return result;
  }
  const missing = [await find('missing'), await find('missing')];
  const known = await find('known');
  console.log(JSON.stringify([missing, known, calls, cache.size]));
}
main().catch(error => { throw error; });
