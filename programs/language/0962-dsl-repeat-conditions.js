function execute(commands,state) {
  for (const [op,...args] of commands) {
    if (op === 'step') state.position += args[0];
    if (op === 'repeat') for (let n = 0; n < args[0]; n++) execute(args[1],state);
    if (op === 'ifAhead' && state.position > args[0]) execute(args[1],state);
    if (op === 'mark') state.marks.push(state.position);
  }
}
const state = {position:0,marks:[]};
execute([['repeat',3,[['step',2],['mark']]],['ifAhead',5,[['step',-1],['mark']]]],state);
console.log(JSON.stringify({...state}));
