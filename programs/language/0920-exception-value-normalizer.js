function capture(fn) {
  try { return {ok:true,value:fn()}; }
  catch(error) { return {ok:false,message:error?.message ?? String(error)}; }
}
const tasks = [() => 7,() => {throw 'missing';},() => {throw new Error('invalid');}];
const results = tasks.map(capture);
const accepted = results.filter(({ok}) => ok).map(({value}) => value);
console.log(JSON.stringify(results));
console.log(JSON.stringify(accepted));
console.log(results.length);
