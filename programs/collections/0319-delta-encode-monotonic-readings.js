const readings = [10,13,13,20,25];
let previous = 0;
const deltas = readings.map(value=>{
  const delta = value-previous;
  previous=value;
  return delta;
});
const decoded = [];
deltas.reduce((sum,delta)=>{ const next=sum+delta; decoded.push(next); return next; },0);
console.log(JSON.stringify({deltas,decoded,equal:decoded.join(",")===readings.join(",")}));
