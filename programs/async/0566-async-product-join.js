async function main() {
  const [prices, counts] = await Promise.all([
    Promise.resolve([['pen', 3], ['book', 12]]),
    Promise.resolve([['book', 4], ['pen', 10]])
  ]);
  const inventory = new Map(counts);
  const valued = prices.map(([sku, price]) => ({ sku, value: price * inventory.get(sku) }));
  const total = valued.reduce((sum, row) => sum + row.value, 0);
  if (inventory.size !== valued.length) throw new Error('missing SKU');
  console.log(JSON.stringify([valued, total]));
}
main().catch(error => { throw error; });
