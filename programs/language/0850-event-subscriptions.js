function bus() {
  let listeners = [];
  return {
    on(fn) { listeners.push(fn); return () => { listeners = listeners.filter(item => item !== fn); }; },
    emit(payload) { for (const listener of [...listeners]) listener({...payload}); }
  };
}
const events = bus(), log = [];
const stop = events.on(({value}) => log.push(value*2));
events.on(({value}) => log.push(value+1));
events.emit({value:3}); stop(); events.emit({value:5});
console.log(JSON.stringify(log));
