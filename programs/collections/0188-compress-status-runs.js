const statuses = ["idle","idle","busy","busy","busy","idle","done"];
const runs = [];
for (const status of statuses) {
  const last = runs[runs.length-1];
  if (last && last.status === status) last.count++;
  else runs.push({status,count:1});
}
const text = runs.map(run => run.status + "*" + run.count);
const expandedCount = runs.reduce((sum,run) => sum+run.count,0);
console.log(JSON.stringify([text,expandedCount]));
