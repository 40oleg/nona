async function main() {
  async function* measurements() {
    for (const value of [3, 8, 2, 5]) yield await Promise.resolve(value);
  }
  const prefix = [0];
  for await (const value of measurements()) prefix.push(prefix.at(-1) + value);
  const queries = [[0, 2], [1, 4], [2, 3]];
  const answers = [];
  for (const [start, end] of queries) answers.push(await Promise.resolve(prefix[end] - prefix[start]));
  console.log(JSON.stringify([prefix, answers]));
}
main().catch(error => { throw error; });
