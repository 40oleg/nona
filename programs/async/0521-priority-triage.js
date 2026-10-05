async function main() {
  const jobs = [{ name: 'billing', priority: 2, order: 0 }, { name: 'outage', priority: 0, order: 1 }, { name: 'account', priority: 2, order: 2 }];
  jobs.sort((a, b) => a.priority - b.priority || a.order - b.order);
  const serviced = [];
  while (jobs.length) {
    const { name, priority } = jobs.shift();
    const receipt = await Promise.resolve(name + '@' + priority);
    serviced.push(receipt);
  }
  console.log(serviced.join(','));
}
main().catch(error => { throw error; });
