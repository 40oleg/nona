async function main() {
  async function* accumulator() {
    let total = 0;
    while (total < 10) {
      const increment = yield total;
      total += await Promise.resolve(increment);
    }
    return total;
  }
  const iterator = accumulator();
  const states = [await iterator.next(), await iterator.next(4), await iterator.next(7)];
  console.log(JSON.stringify(states));
}
main().catch(error => { throw error; });
