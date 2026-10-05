async function main() {
  const orders = new Map([['o1', { customer: 'c2', total: 18 }]]);
  const customers = new Map([['c2', { name: 'Ada', tier: 'gold' }]]);
  async function enrich(id) {
    const order = await Promise.resolve(orders.get(id));
    if (!order) throw new Error('missing order');
    const customer = await Promise.resolve(customers.get(order.customer));
    return { id, ...order, customerName: customer.name, tier: customer.tier };
  }
  const enriched = await enrich('o1');
  console.log(JSON.stringify(enriched));
}
main().catch(error => { throw error; });
