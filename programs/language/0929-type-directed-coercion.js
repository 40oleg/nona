const parsers = {
  integer:value => { const n = Number(value); if (!Number.isInteger(n)) throw new Error('integer'); return n; },
  boolean:value => value === 'yes',
  text:value => value.trim()
};
function parse(fields) {
  const output = {}, errors = [];
  for (const {name,type,value} of fields) {
    try { output[name] = parsers[type](value); } catch(e) { errors.push(name+':'+e.message); }
  }
  return {output,errors};
}
console.log(JSON.stringify(parse([{name:'age',type:'integer',value:'3.5'},{name:'active',type:'boolean',value:'yes'},{name:'name',type:'text',value:' Ada ' }])));
