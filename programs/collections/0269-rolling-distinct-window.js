const categories = ["a","b","a","c","b","b"];
const counts = new Map();
const sizes = [];
for (let i=0;i<categories.length;i++) {
  const key = categories[i];
  counts.set(key,(counts.get(key)||0)+1);
  if (i>=3) {
    const old = categories[i-3];
    counts.set(old,counts.get(old)-1);
    if (counts.get(old)===0) counts.delete(old);
  }
  if (i>=2) sizes.push(counts.size);
}
console.log(JSON.stringify(sizes));
