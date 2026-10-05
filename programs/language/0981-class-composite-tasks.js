class Task {
  constructor(label,cost) { this.label = label; this.cost = cost; }
  run() { return {label:this.label,cost:this.cost}; }
}
class Group {
  constructor(...tasks) { this.tasks = tasks; }
  run() { const children = this.tasks.map(task => task.run()); return {children,cost:children.reduce((sum,row) => sum+row.cost,0)}; }
}
const group = new Group(new Task('read',2),new Group(new Task('parse',3),new Task('write',4)));
console.log(JSON.stringify(group.run()));
