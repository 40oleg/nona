async function main() {
  const deps = new Map([['lexer', []], ['parser', ['lexer']], ['runtime', []], ['app', ['parser', 'runtime']]]);
  const built = new Set();
  const layers = [];
  while (built.size < deps.size) {
    const ready = Array.from(deps.keys()).filter(name => !built.has(name) && deps.get(name).every(d => built.has(d)));
    if (!ready.length) throw new Error('cycle');
    await Promise.all(ready.map(async name => { await Promise.resolve(); built.add(name); }));
    layers.push(ready);
  }
  console.log(JSON.stringify(layers));
}
main().catch(error => { throw error; });
