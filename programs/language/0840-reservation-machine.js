class Reservation {
  constructor() { this.state = 'draft'; this.history = []; }
  transition(action) {
    const rules = {draft:{hold:'held'},held:{pay:'confirmed',cancel:'cancelled'},confirmed:{cancel:'cancelled'}};
    const next = rules[this.state]?.[action];
    if (!next) throw new Error(this.state + ':' + action);
    this.history.push(this.state + '>' + next); this.state = next;
  }
}
const r = new Reservation();
for (const action of ['hold','pay','pay','cancel']) { try { r.transition(action); } catch(e) { r.history.push(e.message); } }
console.log(JSON.stringify({state:r.state,history:r.history}));
