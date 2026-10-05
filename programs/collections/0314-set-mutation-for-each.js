const values = new Set([1,2,3]);
const visited = [];
values.forEach(value=>{
  visited.push(value);
  if (value===1) {
    values.delete(2);
    values.add(4);
  }
});
console.log(JSON.stringify({visited,final:Array.from(values)}));
