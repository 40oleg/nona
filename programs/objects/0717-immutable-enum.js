const Status = Object.freeze({ pending: 0, active: 1, done: 2 });
const reverse = Object.fromEntries(Object.entries(Status).map(([key, value]) => [value, key]));
const job = { status: Status.pending };
function advance(item) {
  if (item.status < Status.done) item.status++;
  return reverse[item.status];
}
console.log(JSON.stringify([
  advance(job), advance(job), advance(job), Reflect.deleteProperty(Status, "done")
]));
