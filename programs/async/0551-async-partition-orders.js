async function main() {
  const orders = [{ id: 'a', value: 40 }, { id: 'b', value: 150 }, { id: 'c', value: 20 }];
  const scored = await Promise.all(orders.map(async order => ({ ...order, manual: await Promise.resolve(order.value > 100) })));
  const groups = scored.reduce((result, { id, manual }) => {
    result[manual ? 'manual' : 'fast'].push(id);
    return result;
  }, { fast: [], manual: [] });
  const count = groups.fast.length + groups.manual.length;
  if (count !== orders.length) throw new Error('lost order');
  console.log(JSON.stringify(groups));
}
main().catch(error => { throw error; });
