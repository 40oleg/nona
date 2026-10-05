const tasks = [{id:"a",p:2},{id:"b",p:0},{id:"c",p:2},{id:"d",p:1}];
const counts = new Array(3).fill(0);
for (const task of tasks) counts[task.p]++;
for (let i=1;i<counts.length;i++) counts[i]+=counts[i-1];
const ordered = new Array(tasks.length);
for (let i=tasks.length-1;i>=0;i--) {
  const task = tasks[i];
  ordered[--counts[task.p]]=task.id;
}
console.log(JSON.stringify(ordered));
