const balances = {a:20,b:10};
const log = [["a",4],["b",-3],["a",-8]];
for (const [account,amount] of log) balances[account] += amount;
const after = {...balances};
const reversed = log.slice().reverse();
for (const [account,amount] of reversed) {
  balances[account] -= amount;
}
const restored = balances.a === 20 && balances.b === 10;
console.log(JSON.stringify({after,balances,restored}));
