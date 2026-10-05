const labels = ["north","south","west","east"];
const values = [12,0,7];
const zipped = [];
const length = Math.max(labels.length,values.length);
for (let i=0;i<length;i++) {
  zipped.push({label:labels[i] ?? "unknown",value:values[i] ?? "missing"});
}
const known = zipped.filter(row => typeof row.value === "number");
const total = known.reduce((sum,row) => sum+row.value,0);
console.log(JSON.stringify({zipped,total}));
