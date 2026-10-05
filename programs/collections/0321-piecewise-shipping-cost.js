function shipping(weight) {
  if (weight===0) return 0;
  const middle = Math.min(Math.max(weight-2,0),3);
  const heavy = Math.max(weight-5,0);
  return 4+middle*2+heavy*3;
}
const packages = [0,1,3,5,7];
const charges = packages.map(weight=>({weight,cost:shipping(weight)}));
const total = charges.reduce((sum,row)=>sum+row.cost,0);
console.log(JSON.stringify({charges,total}));
