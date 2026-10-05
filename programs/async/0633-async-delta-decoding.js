async function main() {
  async function* deltas() {
    for (const delta of [5, 2, -3, 8]) yield await Promise.resolve(delta);
  }
  let position = 10;
  const positions = [position];
  for await (const delta of deltas()) {
    position += delta;
    positions.push(position);
  }
  console.log(JSON.stringify(positions));
}
main().catch(error => { throw error; });
