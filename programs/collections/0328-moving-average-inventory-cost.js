const events = [{kind:"buy",qty:4,cost:3},{kind:"buy",qty:2,cost:6},{kind:"sell",qty:3},{kind:"buy",qty:3,cost:8}];
let quantity = 0;
let value = 0;
const history = [];
for (const event of events) {
  if (event.kind==="buy") { quantity+=event.qty; value+=event.qty*event.cost; }
  else { const average=value/quantity; quantity-=event.qty; value-=average*event.qty; }
  history.push({quantity,value,average:value/quantity});
}
console.log(JSON.stringify(history));
