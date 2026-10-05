const handlers = {
  'add:number': ([a,b]) => a+b,
  'add:string': ([a,b]) => a+b,
  'size:string': ([a]) => a.length,
  'size:object': ([a]) => a.length ?? Object.keys(a).length
};
function dispatch(op,...args) {
  const key = op+':'+typeof args[0];
  return handlers[key]?.(args) ?? 'unsupported';
}
console.log(JSON.stringify([dispatch('add',3,4),dispatch('add','a','b'),dispatch('size',[2,3]),dispatch('bad',0)]));
