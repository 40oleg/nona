const weights = [3,4,5,2,6,1];
const batches = weights.reduce((all,weight) => {
  let current = all[all.length-1];
  if (!current || current.total+weight>8) {
    current = {items:[],total:0};
    all.push(current);
  }
  current.items.push(weight);
  current.total += weight;
  return all;
},[]);
console.log(JSON.stringify(batches));
