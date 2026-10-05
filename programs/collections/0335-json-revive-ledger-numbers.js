const text = '[{"account":"a","amount":"12","internal":1},{"account":"b","amount":"-4","internal":2}]';
const rows = JSON.parse(text,(key,value)=>{
  if (key==="internal") return undefined;
  if (key==="amount") return Number(value);
  return value;
});
const total = rows.reduce((sum,row)=>sum+row.amount,0);
const numeric = rows.every(row=>typeof row.amount==="number");
const report = {rows,total,numeric};
console.log(JSON.stringify(report));
