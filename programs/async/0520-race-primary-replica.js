async function main() {
  const events = [];
  const primary = Promise.resolve().then(() => {
    events.push('primary');
    return { source: 'primary', revision: 8 };
  });
  const replica = Promise.resolve().then(() => Promise.resolve()).then(() => {
    events.push('replica');
    return { source: 'replica', revision: 7 };
  });
  const winner = await Promise.race([primary, replica]);
  await replica;
  console.log(JSON.stringify([winner, events]));
}
main().catch(error => { throw error; });
