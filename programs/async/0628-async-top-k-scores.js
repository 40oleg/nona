async function main() {
  async function* scores() {
    for (const score of [12, 7, 30, 18, 5, 25]) yield await Promise.resolve(score);
  }
  const top = [];
  let discarded = 0;
  for await (const score of scores()) {
    top.push(score); top.sort((a, b) => b - a);
    if (top.length > 3) { top.pop(); discarded++; }
  }
  console.log(JSON.stringify([top, discarded]));
}
main().catch(error => { throw error; });
