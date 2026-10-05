async function main() {
  const account = { points: 0 };
  const outbox = [];
  const published = [];
  async function reward(points) {
    await Promise.resolve();
    account.points += points;
    outbox.push('reward:' + points);
  }
  await reward(10);
  for (const event of outbox.splice(0)) published.push(await Promise.resolve(event));
  console.log(JSON.stringify([account.points, outbox.length, published]));
}
main().catch(error => { throw error; });
