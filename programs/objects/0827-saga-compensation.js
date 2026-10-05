class Saga {
  constructor() { this.steps = []; }
  add(run, compensate) { this.steps.push({ run, compensate }); return this; }
  execute() {
    const completed = [];
    for (const step of this.steps) { if (!step.run()) { for (const previous of completed.reverse()) previous.compensate(); return false; } completed.push(step); }
    return true;
  }
}
const state = { reserved: false, charged: false };
const saga = new Saga().add(() => { state.reserved = true; return true; }, () => { state.reserved = false; }).add(() => false, () => { state.charged = false; });
console.log(JSON.stringify([saga.execute(), state]));
