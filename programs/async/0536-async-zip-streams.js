async function main() {
  async function* source(values) {
    for (const value of values) yield await Promise.resolve(value);
  }
  const prices = source([3, 8, 5]);
  const quantities = source([4, 2]);
  const totals = [];
  while (true) {
    const [price, quantity] = await Promise.all([prices.next(), quantities.next()]);
    if (price.done || quantity.done) break;
    totals.push(price.value * quantity.value);
  }
  await prices.return();
  console.log(JSON.stringify(totals));
}
main().catch(error => { throw error; });
