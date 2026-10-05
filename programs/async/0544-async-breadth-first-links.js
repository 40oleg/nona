async function main() {
  const links = new Map([['a', ['b', 'c']], ['b', ['d']], ['c', ['d']], ['d', []]]);
  const queue = ['a'];
  const seen = new Set(queue);
  const order = [];
  while (queue.length) {
    const key = queue.shift();
    order.push(key);
    for (const next of await Promise.resolve(links.get(key))) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  console.log(order.join('>'));
}
main().catch(error => { throw error; });
