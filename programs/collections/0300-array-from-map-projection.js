const inventory = new Map([["bolt",4],["nut",7],["plate",2]]);
const report = Array.from(inventory,([sku,quantity],index) => {
  return {position:index+1,sku,quantity,value:quantity*(index+2)};
});
const totalValue = report.reduce((sum,row)=>sum+row.value,0);
const largest = report.reduce((best,row)=>row.quantity>best.quantity?row:best,report[0]);
const result = {report,totalValue,largest:largest.sku};
const labels = report.map(row=>row.sku).join("+");
console.log(JSON.stringify([result,labels]));
