const sales = [{rep:"Ada",amount:50},{rep:"Bo",amount:140},{rep:"Cy",amount:220}];
const commissions = sales.map(row=>{
  const first = Math.min(row.amount,100)*5;
  const next = Math.min(Math.max(row.amount-100,0),100)*8;
  const rest = Math.max(row.amount-200,0)*10;
  return {rep:row.rep,cents:first+next+rest};
});
const total = commissions.reduce((sum,row)=>sum+row.cents,0);
const top = commissions.slice().sort((a,b)=>b.cents-a.cents)[0].rep;
console.log(JSON.stringify({commissions,total,top}));
