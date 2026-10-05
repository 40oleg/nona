async function main() {
  async function* readings() {
    for (const value of [10, 14, 12, 20]) {
      await Promise.resolve();
      yield value;
    }
  }
  let total = 0;
  let count = 0;
  const averages = [];
  for await (const value of readings()) averages.push((total += value) / ++count);
  console.log(JSON.stringify(averages));
}
main().catch(error => { throw error; });
