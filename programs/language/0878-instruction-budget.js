function run(program, fuel) {
  let pc = 0, value = 0;
  while (pc < program.length) {
    if (fuel-- === 0) throw new Error('budget:'+value);
    const [op,arg] = program[pc++];
    if (op === 'inc') value += arg ?? 1;
    if (op === 'jump') pc = arg;
  }
  return value;
}
console.log(run([['inc',2],['inc']],4));
try { run([['inc'],['jump',0]],5); } catch(e) { console.log(e.message); }
