class Empty extends Error {}
class Syntax extends Error {}
function parse(text) {
  if (!text) throw new Empty('empty');
  if (!text.includes('=')) throw new Syntax('equals');
  return text.split('=');
}
const counts = {ok:0,empty:0,syntax:0}, values = [];
for (const text of ['a=2','','broken','b=3']) {
  try { values.push(parse(text)); counts.ok++; }
  catch(error) { counts[error instanceof Empty ? 'empty' : 'syntax']++; }
}
console.log(JSON.stringify({counts,values}));
