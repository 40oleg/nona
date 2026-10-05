const oldCart = ["a","b","a","c"];
const newCart = ["b","b","a","d"];
function count(items) {
  const counts = new Map();
  for (const item of items) counts.set(item,(counts.get(item)||0)+1);
  return counts;
}
const oldCounts = count(oldCart);
const newCounts = count(newCart);
const keys = new Set([...oldCounts.keys(),...newCounts.keys()]);
const changes = Array.from(keys,item => [item,(newCounts.get(item)||0)-(oldCounts.get(item)||0)]);
console.log(JSON.stringify(changes.filter(([,delta]) => delta!==0)));
