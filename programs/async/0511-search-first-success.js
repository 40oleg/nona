async function main() {
  const failures = [];
  async function lookup(name, found) {
    await Promise.resolve();
    if (!found) {
      failures.push(name);
      throw new Error(name);
    }
    return { provider: name, matches: 3 };
  }
  const result = await Promise.any([lookup('archive', false), lookup('index', true)]);
  console.log(JSON.stringify([result, failures]));
}
main().catch(error => { throw error; });
