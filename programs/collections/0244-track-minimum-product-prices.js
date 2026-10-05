const changes = [["a",12],["b",7],["a",10],["a",11],["b",5],["c",8]];
const minimum = new Map();
const drops = [];
for (const [sku,price] of changes) {
  const previous = minimum.get(sku);
  if (previous===undefined || price<previous) {
    minimum.set(sku,price);
    if (previous!==undefined) drops.push([sku,previous-price]);
  }
}
console.log(JSON.stringify({minimum:Array.from(minimum),drops}));
