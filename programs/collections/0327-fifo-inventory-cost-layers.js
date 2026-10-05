const layers = [{qty:4,cost:3},{qty:5,cost:4},{qty:2,cost:6}];
const sales = [3,4];
const costs = [];
for (let quantity of sales) {
  let cost = 0;
  while (quantity>0 && layers.length) {
    const taken = Math.min(quantity,layers[0].qty);
    cost+=taken*layers[0].cost;
    quantity-=taken;
    layers[0].qty-=taken;
    if (layers[0].qty===0) layers.shift();
  }
  costs.push(cost);
}
console.log(JSON.stringify({costs,layers}));
