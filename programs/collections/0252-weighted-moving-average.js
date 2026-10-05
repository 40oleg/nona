const values = [2,6,4,10,8];
const weights = [1,2,1];
const smoothed = [];
const denominator = weights.reduce((a,b) => a+b,0);
for (let i=0;i+weights.length<=values.length;i++) {
  const window = values.slice(i,i+weights.length);
  const numerator = window.reduce((sum,value,index) => sum+value*weights[index],0);
  smoothed.push(numerator/denominator);
}
console.log(JSON.stringify(smoothed));
