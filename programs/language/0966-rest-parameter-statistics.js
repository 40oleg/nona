function summarize(...values) {
  const sorted = [...values].sort((a,b) => a-b);
  const [minimum,...tail] = sorted;
  const maximum = tail.pop() ?? minimum;
  const middle = tail.length ? tail : sorted;
  return {minimum,maximum,mean:middle.reduce((sum,n) => sum+n,0)/middle.length};
}
console.log(JSON.stringify(summarize(9,2,4,6,100)));
console.log(JSON.stringify(summarize(7)));
console.log(JSON.stringify(summarize(3,5)));
