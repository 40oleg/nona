async function main() {
  const values = [2, 5, 9, 13, 18, 24];
  let low = 0;
  let high = values.length - 1;
  let found = -1;
  const probes = [];
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const value = await Promise.resolve(values[middle]); probes.push(value);
    if (value === 18) { found = middle; break; }
    if (value < 18) low = middle + 1; else high = middle - 1;
  }
  console.log(JSON.stringify([found, probes]));
}
main().catch(error => { throw error; });
