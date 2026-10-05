function validate({header:{version=1} = {},body:{name,values=[]} = {}}) {
  if (version !== 1) throw new Error('version');
  if (!name) throw new Error('name');
  return {name,total:values.reduce((sum,n) => sum+n,0)};
}
const packets = [{body:{name:'x',values:[2,3]}},{header:{version:2},body:{name:'y'}},{}];
const results = [];
for (const packet of packets) {
  try { results.push(validate(packet)); } catch(error) { results.push({error:error.message}); }
}
console.log(JSON.stringify(results));
