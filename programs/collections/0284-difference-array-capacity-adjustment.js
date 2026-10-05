const days = 6;
const difference = new Array(days+1).fill(0);
for (const [start,end,amount] of [[1,4,3],[2,6,-1],[0,2,2]]) {
  difference[start]+=amount;
  difference[end]-=amount;
}
let running = 0;
const capacities = difference.slice(0,days).map(delta => {
  running+=delta;
  return 5+running;
});
console.log(JSON.stringify(capacities));
