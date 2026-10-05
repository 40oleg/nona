class Account {
  constructor(balance) { this.balance = balance; this.history = []; }
  apply({kind,amount}) {
    const next = this.balance+(kind === 'deposit' ? amount : -amount);
    if (next < 0) throw new Error('insufficient');
    this.balance = next; this.history.push(kind+':'+amount);
  }
}
const account = new Account(5), errors = [];
for (const command of [{kind:'withdraw',amount:8},{kind:'deposit',amount:4},{kind:'withdraw',amount:3}]) {
  try { account.apply(command); } catch(e) { errors.push(e.message); }
}
console.log(JSON.stringify({balance:account.balance,history:account.history,errors}));
