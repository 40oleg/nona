async function main() {
  const done = new Set();
  async function task(name, deps) {
    for (const dep of deps) if (!done.has(dep)) throw new Error(dep);
    await Promise.resolve();
    done.add(name);
  }
  await Promise.all([task('pack', []), task('label', [])]);
  await task('ship', ['pack', 'label']);
  console.log(JSON.stringify(Array.from(done)));
}
main().catch(error => { throw error; });
