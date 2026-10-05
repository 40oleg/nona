const events = [];
function parse(value) {
  if (!value.includes(':')) throw new Error('separator');
  return value.split(':');
}
function task(label,value) {
  try { return parse(value); }
  catch(error) { throw new Error(label+'/'+error.message); }
  finally { events.push(label); }
}
try { task('import','bad'); } catch(error) { console.log(error.message); }
console.log(JSON.stringify({parsed:task('good','a:b'),events}));
