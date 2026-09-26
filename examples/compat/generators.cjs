let count=0;
function* values(){
  count++;
  const received=yield count;
  return received+count;
}
const iterator=values();
console.log(count,iterator.next().value,iterator.next(7).value,iterator.next().done);

function* finishing(){
  try { yield 1; }
  finally { yield 2; }
}
const closing=finishing();
console.log(closing.next().value,closing.return(8).value,closing.next().value);

function* catching(){
  try { yield 1; }
  catch (error) { return error+1; }
}
const throwing=catching();
throwing.next();
console.log(throwing.throw(3).value);

function* delegated(){
  const completion=yield* values();
  return completion*2;
}
const forwarding=delegated();
console.log(forwarding.next().value,forwarding.next(5).value);
