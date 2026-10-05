const readings = [{group:"a",v:2},{group:"a",v:3},{group:"a",v:10},{group:"b",v:5},{group:"b",v:7}];
const groups = new Map();
for (const reading of readings) {
  if (!groups.has(reading.group)) groups.set(reading.group,[]);
  groups.get(reading.group).push(reading.v);
}
const means = new Map(Array.from(groups,([group,values]) => [group,values.reduce((a,b)=>a+b,0)/values.length]));
const outliers = readings.filter(reading => Math.abs(reading.v-means.get(reading.group))>3);
const report = {means:Array.from(means),outliers};
console.log(JSON.stringify(report));
