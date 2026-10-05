async function main() {
  const parent = new Map([['a', 'a'], ['b', 'b'], ['c', 'c'], ['d', 'd']]);
  function root(key) {
    if (parent.get(key) !== key) parent.set(key, root(parent.get(key)));
    return parent.get(key);
  }
  for (const edge of [['a', 'b'], ['c', 'd'], ['b', 'c']]) {
    const [a, b] = await Promise.resolve(edge);
    parent.set(root(b), root(a));
  }
  const connected = Array.from(parent.keys()).map(key => [key, root(key)]);
  console.log(JSON.stringify(connected));
}
main().catch(error => { throw error; });
