async function main() {
  let sequence = 0;
  const events = [];
  async function stamp(name, id = ++sequence) {
    events.push('enter:' + id);
    await Promise.resolve();
    return name + '#' + id;
  }
  const values = await Promise.all([stamp('a'), stamp('b', 9), stamp('c')]);
  const assigned = sequence;
  console.log(JSON.stringify([values, events, assigned]));
}
main().catch(error => { throw error; });
