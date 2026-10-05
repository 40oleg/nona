async function main() {
  function* values() {
    yield Promise.resolve(4);
    yield 6;
    yield Promise.resolve(8);
  }
  let sum = 0;
  const types = [];
  for await (const value of values()) { sum += value; types.push(typeof value); }
  const mean = sum / types.length;
  console.log(JSON.stringify([sum, mean, types]));
}
main().catch(error => { throw error; });
