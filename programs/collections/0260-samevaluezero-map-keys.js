const keys = [NaN,NaN,0,-0,1,1];
const counts = new Map();
for (const key of keys) counts.set(key,(counts.get(key)||0)+1);
const labels = [];
for (const [key,count] of counts) {
  const label = Number.isNaN(key) ? "nan" : String(key);
  labels.push([label,count]);
}
const hasNegativeZero = counts.has(-0);
console.log(JSON.stringify({labels,hasNegativeZero,size:counts.size}));
