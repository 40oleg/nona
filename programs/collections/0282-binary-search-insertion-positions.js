const catalog = [10,20,20,40,50];
function lowerBound(value) {
  let low = 0;
  let high = catalog.length;
  while (low<high) {
    const middle = Math.floor((low+high)/2);
    if (catalog[middle]<value) low=middle+1;
    else high=middle;
  }
  return low;
}
console.log(JSON.stringify([5,20,30,60].map(value=>[value,lowerBound(value)])));
