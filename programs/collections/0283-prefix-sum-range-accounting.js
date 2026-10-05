const expenses = [4,7,2,6,3];
const prefix = [0];
expenses.reduce((sum,value) => {
  const next = sum+value;
  prefix.push(next);
  return next;
},0);
const ranges = [[0,2],[1,4],[3,5]];
const totals = ranges.map(([start,end]) => prefix[end]-prefix[start]);
console.log(JSON.stringify({prefix,totals}));
