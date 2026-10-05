async function main() {
  let generation = 0;
  let displayed = '';
  const decisions = [];
  async function search(term) {
    const own = ++generation;
    const result = await Promise.resolve(term.toUpperCase());
    if (own === generation) { displayed = result; decisions.push('shown:' + term); }
    else decisions.push('stale:' + term);
  }
  await Promise.all([search('old'), search('new')]);
  console.log(JSON.stringify([displayed, decisions]));
}
main().catch(error => { throw error; });
