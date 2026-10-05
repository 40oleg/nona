const commands = {sum:{arity:2,run:([a,b]) => Number(a)+Number(b)},echo:{arity:1,run:([a]) => a}};
function invoke(line) {
  const [name,...args] = line.split(' ');
  const definition = commands[name];
  if (!definition) throw new Error('unknown');
  if (args.length !== definition.arity) throw new Error('arity:'+name);
  return definition.run(args);
}
console.log(Object.keys(commands).map(name => name+'/'+commands[name].arity).join(','));
for (const line of ['sum 3 5','echo hi','sum 1']) {
  try { console.log(invoke(line)); } catch(error) { console.log(error.message); }
}
