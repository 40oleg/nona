function* stage(name, values) {
  let total = 0;
  for (const value of values) { total += value; yield name+':'+value; }
  return total;
}
function* workflow() {
  const a = yield* stage('read',[2,3]);
  const b = yield* stage('write',[4]);
  return a+b;
}
const runner = workflow(), log = []; let step;
do { step = runner.next(); log.push(step.value); } while (!step.done);
console.log(JSON.stringify(log));
