const expenses = [{payer:"Ada",amount:12,users:["Ada","Bo","Cy"]},{payer:"Bo",amount:6,users:["Ada","Bo"]}];
const balances = new Map([["Ada",0],["Bo",0],["Cy",0]]);
for (const expense of expenses) {
  balances.set(expense.payer,balances.get(expense.payer)+expense.amount);
  const share = expense.amount/expense.users.length;
  for (const user of expense.users) balances.set(user,balances.get(user)-share);
}
const owing = Array.from(balances).filter(([,amount]) => amount<0);
const net = Array.from(balances.values()).reduce((a,b) => a+b,0);
console.log(JSON.stringify({balances:Array.from(balances),owing,net}));
