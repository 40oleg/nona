const cart = [{sku:"pen",qty:12,price:3},{sku:"book",qty:2,price:8},{sku:"pad",qty:5,price:4}];
const lines = cart.map(item => {
  const rate = item.qty >= 10 ? 0.8 : item.qty >= 5 ? 0.9 : 1;
  const cents = Math.round(item.qty*item.price*100*rate);
  return {sku:item.sku,cents};
});
const total = lines.reduce((sum,line) => sum+line.cents,0);
const largest = lines.reduce((best,line) => line.cents>best.cents?line:best,lines[0]);
const summary = [lines,total,largest.sku];
console.log(JSON.stringify(summary));
