const events = [];
function* inner() {
  try { yield 1; yield 2; }
  finally { events.push('inner'); }
}
function* outer() {
  try { yield* inner(); yield 3; }
  finally { events.push('outer'); }
}
const iterator = outer(); const first = iterator.next().value; iterator.return('stop');
console.log(JSON.stringify({first,events:[...events],done:iterator.next().done}));
