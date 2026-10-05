async function main() {
  const pending = new Map();
  let reads = 0;
  function load(key) {
    if (!pending.has(key)) {
      const request = Promise.resolve().then(() => { reads++; return key.toUpperCase(); });
      pending.set(key, request.finally(() => pending.delete(key)));
    }
    return pending.get(key);
  }
  const values = await Promise.all([load('ada'), load('ada'), load('bob')]);
  console.log(JSON.stringify([values, reads, pending.size]));
}
main().catch(error => { throw error; });
