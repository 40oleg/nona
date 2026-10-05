async function main() {
  async function* tokens() { for (const token of ['#A', 'alpha', '#B', 'beta']) yield await Promise.resolve(token); }
  const iterator = tokens();
  const sections = [];
  let current = await iterator.next();
  while (!current.done) {
    const title = current.value.slice(1);
    const body = await iterator.next();
    if (body.done || body.value.startsWith('#')) throw new Error('missing body');
    sections.push(title + '=' + body.value);
    current = await iterator.next();
  }
  console.log(sections.join(';'));
}
main().catch(error => { throw error; });
