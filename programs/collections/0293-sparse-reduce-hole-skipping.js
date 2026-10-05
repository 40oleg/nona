const values = [,4,,6,0,,2];
const visited = [];
const sum = values.reduce((total,value,index) => {
  visited.push(index);
  return total+value;
},0);
const entries = Array.from(values.entries()).map(([index,value])=>[index,value??"missing"]);
const density = visited.length/values.length;
const report = {visited,sum,entries,density};
console.log(JSON.stringify(report));
