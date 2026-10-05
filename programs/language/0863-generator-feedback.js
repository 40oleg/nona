function* accumulator() {
  let total = 0;
  for (let step = 0; step < 3; step++) {
    const incoming = yield total;
    total += incoming ?? 1;
  }
  return total;
}
const machine = accumulator(), observations = [];
observations.push(machine.next().value);
for (const input of [4,undefined,2]) { const {value,done} = machine.next(input); observations.push({value,done}); }
console.log(JSON.stringify(observations));
