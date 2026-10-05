const waiting = [['a', 5], ['b', 2], ['c', 4]], quantum = 2, finished = [];
let clock = 0;
while (waiting.length) {
  const [name, remaining] = waiting.shift(), work = Math.min(quantum, remaining);
  clock += work;
  if (remaining > work) waiting.push([name, remaining - work]); else finished.push([name, clock]);
}
if (clock !== 11) throw new Error('work conservation');
console.log(JSON.stringify(finished));
