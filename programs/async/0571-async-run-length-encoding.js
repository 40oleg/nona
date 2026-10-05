async function main() {
  async function* symbols() {
    for (const symbol of ['a', 'a', 'b', 'c', 'c', 'c']) yield await Promise.resolve(symbol);
  }
  const runs = [];
  for await (const symbol of symbols()) {
    const previous = runs.at(-1);
    if (previous && previous.symbol === symbol) previous.count++;
    else runs.push({ symbol, count: 1 });
  }
  console.log(JSON.stringify(runs));
}
main().catch(error => { throw error; });
