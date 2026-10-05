async function main() {
  const stock = new Map([['ink', 7], ['paper', 12]]);
  const decisions = [];
  async function reserve(item, amount) {
    await Promise.resolve(item);
    if (stock.get(item) < amount) throw new Error('short:' + item);
    stock.set(item, stock.get(item) - amount);
    return item + ':' + amount;
  }
  for (const [item, amount] of [['ink', 4], ['ink', 5], ['paper', 6]]) {
    try { decisions.push(await reserve(item, amount)); }
    catch (error) { decisions.push(error.message); }
  }
  console.log(JSON.stringify([decisions, Array.from(stock)]));
}
main().catch(error => { throw error; });
