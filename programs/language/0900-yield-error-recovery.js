const log = [];
function* conversation() {
  try {
    try { yield 'question'; }
    catch(error) { log.push(error.message); yield 'retry'; }
    yield 'answer';
  } finally { log.push('finished'); }
}
const flow = conversation();
const values = [flow.next().value,flow.throw(new Error('lost')).value,flow.next().value];
flow.next();
console.log(JSON.stringify({values,log}));
