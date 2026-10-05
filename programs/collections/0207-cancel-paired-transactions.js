const transactions = [{ref:"x",amount:20},{ref:"y",amount:7},{ref:"x",amount:-20},{ref:"z",amount:4}];
const totals = new Map();
for (const entry of transactions) {
  totals.set(entry.ref,(totals.get(entry.ref)||0)+entry.amount);
}
const surviving = transactions.filter(entry => totals.get(entry.ref)!==0);
const canceled = Array.from(totals).filter(([,total]) => total===0).map(([ref]) => ref);
const balance = surviving.reduce((sum,entry) => sum+entry.amount,0);
const result = {surviving,canceled,balance};
console.log(JSON.stringify(result));
