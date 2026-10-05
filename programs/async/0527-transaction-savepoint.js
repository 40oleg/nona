async function main() {
  let basket = [{ item: 'book', price: 20 }];
  basket.push(await Promise.resolve({ item: 'pen', price: 4 }));
  const savepoint = basket.map(line => ({ ...line }));
  try {
    basket[0].price -= await Promise.resolve(25);
    if (basket[0].price < 0) throw new Error('negative price');
  } catch (error) { basket = savepoint; }
  const total = basket.reduce((sum, line) => sum + line.price, 0);
  console.log(JSON.stringify([basket, total]));
}
main().catch(error => { throw error; });
