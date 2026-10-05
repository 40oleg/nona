async function main() {
  const folders = new Map([['root', ['docs', 'src']], ['docs', ['guides']], ['src', []], ['guides', []]]);
  const order = [];
  async function visit(name) {
    order.push(name);
    const children = await Promise.resolve(folders.get(name));
    for (const child of children) await visit(child);
  }
  await visit('root');
  const depth = order.indexOf('guides') < order.indexOf('src');
  console.log(JSON.stringify([order, depth]));
}
main().catch(error => { throw error; });
