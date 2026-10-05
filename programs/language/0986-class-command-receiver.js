class Robot {
  constructor() { this.position = 0; this.notes = []; }
  move(distance) { this.position += distance; }
  note(text) { this.notes.push(text); }
  execute([name,...args]) {
    const method = this[name];
    if (typeof method !== 'function' || name === 'execute') throw new Error('command:'+name);
    method.apply(this,args);
  }
}
const robot = new Robot();
for (const command of [['move',4],['note','arrived'],['missing']]) { try { robot.execute(command); } catch(e) { robot.notes.push(e.message); } }
console.log(JSON.stringify({position:robot.position,notes:robot.notes,last:robot.notes.at(-1)?.length}));
