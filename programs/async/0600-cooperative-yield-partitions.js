async function main() {
  const events = [];
  const peer = Promise.resolve().then(() => events.push('peer'));
  let sum = 0;
  for (let start = 0; start < 6; start += 2) {
    for (let i = start; i < start + 2; i++) sum += i;
    events.push('partition:' + start);
    await Promise.resolve();
  }
  await peer;
  console.log(JSON.stringify([sum, events]));
}
main().catch(error => { throw error; });
