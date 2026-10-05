const first = [2,3,1];
const second = [1,2];
const combined = new Array(first.length+second.length-1).fill(0);
for (let i=0;i<first.length;i++) {
  for (let j=0;j<second.length;j++) combined[i+j]+=first[i]*second[j];
}
const total = combined.reduce((a,b)=>a+b,0);
const probabilities = combined.map(count=>count/total);
const weightedDelay = combined.reduce((sum,count,index)=>sum+count*index,0)/total;
console.log(JSON.stringify({combined,total,probabilities,weightedDelay}));
