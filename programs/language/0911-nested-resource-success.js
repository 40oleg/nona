const trace = [];
function use(name, callback) {
  trace.push('acquire:'+name);
  try { return callback({name,size:name.length}); }
  finally { trace.push('release:'+name); }
}
const total = use('outer',({size:a}) => {
  return use('inner',({size:b}) => a*b);
});
console.log(total);
console.log(JSON.stringify(trace));
