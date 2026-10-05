const lines = [{sku:"a",qty:5,price:3},{sku:"b",qty:2,price:8}];
const refunds = [["a",2],["a",1],["b",4]];
const returned = new Map();
for (const [sku,qty] of refunds) returned.set(sku,(returned.get(sku)||0)+qty);
const remaining = lines.map(line => {
  const refunded = Math.min(line.qty,returned.get(line.sku)||0);
  return {sku:line.sku,qty:line.qty-refunded,value:(line.qty-refunded)*line.price};
});
const retained = remaining.reduce((sum,line) => sum+line.value,0);
console.log(JSON.stringify({remaining,retained}));
