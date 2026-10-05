const trace = [];
function execute(commands,state) {
  for (const [op,arg] of commands) {
    if (op === 'batch') execute(arg,state);
    else if (op === 'add') state.value += arg;
    else if (op === 'multiply') state.value *= arg;
    else if (op === 'log') trace.push(state.value);
  }
}
const state = {value:1};
execute([['add',2],['batch',[['multiply',4],['log']]],['add',1],['log']],state);
console.log(JSON.stringify({state,trace}));
