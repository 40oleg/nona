function coalescer(consume) {
  let pending = null;
  return {
    submit(...values) { pending = values; },
    flush() { if (!pending) return; const values = pending; pending = null; consume(...values); }
  };
}
const log = [], queue = coalescer((label,value) => log.push({label,value}));
queue.submit('first',1); queue.submit('second',2); queue.flush(); queue.flush(); queue.submit('third',3); queue.flush();
const [first,...rest] = log;
console.log(JSON.stringify({first,rest}));
