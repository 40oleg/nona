const events = [{kind:"credit",customer:"Ada",amount:15},{kind:"invoice",customer:"Ada",amount:9},{kind:"invoice",customer:"Bo",amount:7},{kind:"credit",customer:"Ada",amount:4},{kind:"invoice",customer:"Ada",amount:13}];
const credits = new Map();
const invoices = [];
for (const event of events) {
  const available = credits.get(event.customer)||0;
  if (event.kind==="credit") {
    credits.set(event.customer,available+event.amount);
  } else {
    const applied = Math.min(available,event.amount);
    credits.set(event.customer,available-applied);
    invoices.push({customer:event.customer,total:event.amount,applied,due:event.amount-applied});
  }
}
const due = invoices.reduce((sum,invoice)=>sum+invoice.due,0);
console.log(JSON.stringify({invoices,due,credits:Array.from(credits)}));
