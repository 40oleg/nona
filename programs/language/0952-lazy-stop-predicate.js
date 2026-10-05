let closed = false;
function* source() {
  try { for (let n = 1; n < 8; n++) yield n; }
  finally { closed = true; }
}
function* takeWhile(input,predicate) {
  for (const value of input) { if (!predicate(value)) return; yield value; }
}
const values = [...takeWhile(source(),n => n*n < 20)];
console.log(JSON.stringify({values,closed}));
