async function main() {
  const lines = [{ price: 8, count: 2 }, { price: 3, count: 5 }, { price: 12, count: 1 }];
  const trail = [];
  const total = await lines.reduce(async (previous, line) => {
    const subtotal = await previous;
    const { price, count } = line;
    const next = subtotal + await Promise.resolve(price * count);
    trail.push(next);
    return next;
  }, Promise.resolve(0));
  console.log(JSON.stringify([total, trail]));
}
main().catch(error => { throw error; });
