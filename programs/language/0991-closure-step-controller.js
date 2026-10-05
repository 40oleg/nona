function controller(steps) {
  let cursor = 0; const log = [];
  return {
    advance(context) {
      const step = steps[cursor++];
      if (!step) return false;
      log.push(step(context)); return true;
    }, report() { return {completed:Math.min(cursor,steps.length),log}; }
  };
}
const run = controller([({name}) => 'hello '+name,({count}) => count*2]);
while (run.advance({name:'Ada',count:3})) {}
console.log(JSON.stringify({...run.report(),last:run.report().log[4] ?? 'end'}));
