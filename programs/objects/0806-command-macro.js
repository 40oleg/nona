class Switch {
  constructor() { this.on = false; this.history = []; }
  set(on) { this.history.push(this.on); this.on = on; }
  undo() { if (this.history.length) this.on = this.history.pop(); }
}
class Macro {
  constructor(commands) { this.commands = commands; }
  execute() { for (const command of this.commands) command.execute(); }
  undo() { for (const command of [...this.commands].reverse()) command.undo(); }
}
const a = new Switch(), b = new Switch();
const macro = new Macro([a, b].map(item => ({ execute: () => item.set(true), undo: () => item.undo() })));
macro.execute(); const active = [a.on, b.on]; macro.undo();
console.log(JSON.stringify([active, [a.on, b.on]]));
