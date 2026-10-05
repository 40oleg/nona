const queue = [{name:"a",priority:1},{name:"b",priority:3},{name:"c",priority:3},{name:"d",priority:2}];
const indexed = queue.map((job,position) => ({...job,position}));
indexed.sort((left,right) => {
  const priorityDifference = right.priority-left.priority;
  return priorityDifference || left.position-right.position;
});
const served = [];
for (const {name,priority} of indexed) served.push(name + ":" + priority);
const highest = indexed[0].priority;
console.log(JSON.stringify([served,highest]));
