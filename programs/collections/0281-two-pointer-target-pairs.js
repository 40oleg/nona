const prices = [1,2,3,4,5,6,7,8];
const target = 9;
let low = 0;
let high = prices.length-1;
const pairs = [];
while (low<high) {
  const sum = prices[low]+prices[high];
  if (sum===target) { pairs.push([prices[low],prices[high]]); low++; high--; }
  else if (sum<target) low++;
  else high--;
}
console.log(JSON.stringify(pairs));
