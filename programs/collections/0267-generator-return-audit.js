function* batches() {
  let total = 0;
  for (const amount of [3,5,2]) { total+=amount; yield amount*2; }
  return {count:3,total};
}
const iterator = batches();
const values = [];
let step = iterator.next();
while (!step.done) { values.push(step.value); step=iterator.next(); }
const summary = step.value;
console.log(JSON.stringify({values,summary}));
