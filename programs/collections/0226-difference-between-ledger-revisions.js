const oldLedger = {cash:50,debt:-10,stock:30};
const newLedger = {cash:45,debt:-4,reserve:8};
const accounts = new Set([...Object.keys(oldLedger),...Object.keys(newLedger)]);
const deltas = [];
for (const account of accounts) {
  const change = (newLedger[account] ?? 0)-(oldLedger[account] ?? 0);
  if (change!==0) deltas.push([account,change]);
}
const net = deltas.reduce((sum,[,change]) => sum+change,0);
console.log(JSON.stringify({deltas,net}));
