function link(source) {
  const labels = {}, code = [];
  for (const [op,arg] of source) { if (op === 'label') labels[arg] = code.length; else code.push([op,arg]); }
  return code.map(([op,arg]) => {
    if (op !== 'jumpIf') return [op,arg];
    if (labels[arg] === undefined) throw new Error('label:'+arg);
    return [op,labels[arg]];
  });
}
const code = link([['set',3],['label','again'],['emit'],['decrement'],['jumpIf','again']]);
let pc = 0, register = 0; const output = [];
while (pc < code.length) {
  const [op,arg] = code[pc++];
  if (op === 'set') register = arg;
  else if (op === 'emit') output.push(register);
  else if (op === 'decrement') register--;
  else if (op === 'jumpIf' && register > 0) pc = arg;
}
console.log(JSON.stringify({code:[...code],output,register}));
