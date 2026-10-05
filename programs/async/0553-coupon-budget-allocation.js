async function main() {
  const eligibility = new Map([['ada', true], ['ben', false], ['cara', true]]);
  const orders = [{ customer: 'ada', amount: 90 }, { customer: 'ben', amount: 120 }, { customer: 'cara', amount: 60 }];
  const evaluated = await Promise.all(orders.map(async order => ({ ...order, eligible: await Promise.resolve(eligibility.get(order.customer)) })));
  evaluated.sort((a, b) => b.amount - a.amount);
  let budget = 12;
  const receipts = [];
  for (const order of evaluated) {
    const requested = Math.floor(order.amount / 10);
    const discount = order.eligible ? Math.min(requested, budget) : 0;
    budget -= discount;
    receipts.push({ customer: order.customer, charged: order.amount - discount, discount });
  }
  console.log(JSON.stringify([receipts, budget]));
}
main().catch(error => { throw error; });
