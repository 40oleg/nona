async function main() {
  const pending = new Map([['red', Promise.resolve(3)], ['blue', Promise.resolve(5)]]);
  const entries = await Promise.all(Array.from(pending, async ([key, value]) => [key, await value]));
  const resolved = new Map(entries);
  let total = 0;
  for (const value of resolved.values()) total += value;
  const names = Array.from(resolved.keys());
  if (names.length !== pending.size) throw new Error('association lost');
  console.log(JSON.stringify([entries, total]));
}
main().catch(error => { throw error; });
