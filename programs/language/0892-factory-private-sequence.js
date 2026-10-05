function tickets(prefix) {
  let next = 1; const active = [];
  return {
    issue() { const id = prefix+next++; active.push(id); return id; },
    retire(id) { const index = active.indexOf(id); if (index >= 0) active.splice(index,1); },
    active() { return [...active]; }
  };
}
const office = tickets('T'), [a,b] = [office.issue(),office.issue()];
office.retire(a); office.issue();
console.log(JSON.stringify({retired:a,second:b,active:office.active()}));
