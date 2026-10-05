async function main() {
  const sales = [['North', 12], ['SOUTH', 8], ['north', 5]];
  const totals = new Map();
  for (const [rawRegion, amount] of sales) {
    const region = await Promise.resolve(rawRegion.toLowerCase());
    const previous = totals.get(region) || 0;
    totals.set(region, previous + amount);
  }
  const result = Array.from(totals).sort((a, b) => a[0].localeCompare(b[0]));
  console.log(JSON.stringify(result));
}
main().catch(error => { throw error; });
