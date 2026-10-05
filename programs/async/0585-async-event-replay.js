async function main() {
  async function* journal() {
    for (const event of [{ type: 'deposit', amount: 20 }, { type: 'withdraw', amount: 7 }, { type: 'deposit', amount: 4 }]) yield await Promise.resolve(event);
  }
  let balance = 0;
  const checkpoints = [];
  for await (const event of journal()) {
    switch (event.type) {
      case 'deposit': balance += event.amount; break;
      case 'withdraw': balance -= event.amount; break;
      default: throw new Error('unknown event');
    }
    checkpoints.push(balance);
  }
  console.log(JSON.stringify(checkpoints));
}
main().catch(error => { throw error; });
