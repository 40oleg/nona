const groups = [["a",["b",["c"]]],["d"],"e"];
const one = groups.flat(1);
const two = groups.flat(2);
const all = groups.flat(Infinity);
const scalarCounts = [one,two,all].map(items=>items.filter(item=>!Array.isArray(item)).length);
const totalLabels = new Set(all).size;
const result = {one,two,all,scalarCounts,totalLabels};
const remainingNested = two.some(Array.isArray);
console.log(JSON.stringify([result,remainingNested]));
