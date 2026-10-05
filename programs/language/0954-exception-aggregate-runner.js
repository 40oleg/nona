class Failures extends Error {
  constructor(messages) { super(messages.join('|')); this.count = messages.length; }
}
function run(...jobs) {
  const values = [], errors = [];
  for (const job of jobs) { try { values.push(job()); } catch(error) { errors.push(error.message); } }
  if (errors.length) throw new Failures(errors);
  return values;
}
try { run(() => 1,() => {throw new Error('a');},() => {throw new Error('b');}); }
catch(error) { console.log(JSON.stringify({message:error.message,count:error.count})); }
console.log(JSON.stringify(run(() => 2,() => 3)));
