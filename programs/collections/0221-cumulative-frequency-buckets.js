const scores = [2,4,2,1,4,5,3,2];
const frequency = new Map();
for (const score of scores) frequency.set(score,(frequency.get(score)||0)+1);
const sorted = Array.from(frequency).sort((a,b) => a[0]-b[0]);
let cumulative = 0;
const buckets = sorted.map(([score,count]) => {
  cumulative += count;
  return {score,count,cumulative};
});
console.log(JSON.stringify(buckets));
