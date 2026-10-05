const waiting = [{id:"a",qty:4},{id:"b",qty:3},{id:"c",qty:2}];
const arrivals = [2,5,3];
let stock = 0;
const shipped = [];
for (const amount of arrivals) {
  stock += amount;
  while (waiting.length && waiting[0].qty<=stock) {
    const order = waiting.shift();
    stock -= order.qty;
    shipped.push(order.id);
  }
}
console.log(JSON.stringify({shipped,stock,waiting}));
