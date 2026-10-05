const stock = new Map([["bolt", 8], ["nut", 5]]);
const orders = [{item:"bolt",qty:3},{item:"nut",qty:7},{item:"bolt",qty:4}];
const accepted = [];
for (const order of orders) {
  const available = stock.get(order.item) || 0;
  if (available >= order.qty) {
    stock.set(order.item, available - order.qty);
    accepted.push(order.item + ":" + order.qty);
  }
}
console.log(JSON.stringify([accepted, Array.from(stock)]));
