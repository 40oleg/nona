async function main() {
  async function* source() { for (const n of [1, 2, 3, 4, 5]) yield await Promise.resolve(n); }
  async function* evenSquares(input) {
    for await (const number of input) {
      const accepted = await Promise.resolve(number % 2 === 0);
      if (accepted) yield await Promise.resolve(number * number);
    }
  }
  const result = [];
  for await (const value of evenSquares(source())) result.push(value);
  console.log(JSON.stringify(result));
}
main().catch(error => { throw error; });
