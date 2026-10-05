const sales = [4,9,2,7,6,1];
let best = {start:0,total:-1};
const windows = [];
for (let start=0;start+3<=sales.length;start++) {
  const total = sales.slice(start,start+3).reduce((a,b) => a+b,0);
  windows.push(total);
  if (total>best.total) best={start,total};
}
const days = sales.slice(best.start,best.start+3);
console.log(JSON.stringify({best,days,windows}));
