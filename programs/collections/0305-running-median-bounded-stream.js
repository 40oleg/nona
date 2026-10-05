const stream = [5,1,9,3,7];
const sorted = [];
const medians = [];
for (const value of stream) {
  let position = sorted.findIndex(existing=>existing>value);
  if (position===-1) position=sorted.length;
  sorted.splice(position,0,value);
  const middle = Math.floor(sorted.length/2);
  medians.push(sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2);
}
console.log(JSON.stringify({sorted,medians}));
