const inventory = [{sku:"a",stock:3,min:8},{sku:"b",stock:9,min:4},{sku:"c",stock:1,min:3}];
const alerts = inventory.filter(item => item.stock < item.min);
alerts.sort((a,b) => (b.min-b.stock)-(a.min-a.stock));
const messages = alerts.map(item => {
  const shortage = item.min-item.stock;
  return item.sku + ":order=" + shortage;
});
const shortageTotal = alerts.reduce((sum,item) => sum+item.min-item.stock,0);
const result = [messages,shortageTotal];
console.log(JSON.stringify(result));
