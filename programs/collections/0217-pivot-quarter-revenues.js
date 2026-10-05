const sales = [{region:"east",q:1,value:10},{region:"west",q:2,value:7},{region:"east",q:2,value:12},{region:"west",q:1,value:9}];
const rows = new Map();
for (const sale of sales) {
  if (!rows.has(sale.region)) rows.set(sale.region,[0,0]);
  rows.get(sale.region)[sale.q-1] += sale.value;
}
const report = Array.from(rows).map(([region,quarters]) => {
  const total = quarters.reduce((a,b) => a+b,0);
  return {region,quarters,total};
});
console.log(JSON.stringify(report));
