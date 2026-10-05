async function main() {
  const tree = { weight: 2, children: [{ weight: 3, children: [] }, { weight: 4, children: [{ weight: 5, children: [] }] }] };
  async function weight(node) {
    const own = await Promise.resolve(node.weight);
    const children = await Promise.all(node.children.map(weight));
    return own + children.reduce((sum, value) => sum + value, 0);
  }
  const total = await weight(tree);
  const rootOnly = await weight({ weight: 9, children: [] });
  console.log(total + ':' + rootOnly);
}
main().catch(error => { throw error; });
