const readings = [["a",9],["b",2],["a",3],["b",8],["a",5],["b",4],["b",6]];
const groups = new Map();
for (const [sensor,value] of readings) {
  if (!groups.has(sensor)) groups.set(sensor,[]);
  groups.get(sensor).push(value);
}
const medians = Array.from(groups).map(([sensor,values]) => {
  values.sort((a,b) => a-b);
  const mid = Math.floor(values.length/2);
  return [sensor,values.length%2 ? values[mid] : (values[mid-1]+values[mid])/2];
});
console.log(JSON.stringify(medians));
