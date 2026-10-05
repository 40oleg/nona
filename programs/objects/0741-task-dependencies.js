class Task {
  constructor(name, dependencies = []) { this.name = name; this.dependencies = dependencies; this.done = false; }
  get ready() { return !this.done && this.dependencies.every(task => task.done); }
  run(log) { if (!this.ready) return false; this.done = true; log.push(this.name); return true; }
}
const fetch = new Task("fetch"), parse = new Task("parse", [fetch]), render = new Task("render", [parse]);
const tasks = [render, parse, fetch], log = [];
for (let pass = 0; pass < 3; pass++) for (const task of tasks) task.run(log);
console.log(JSON.stringify([log, tasks.every(task => task.done)]));
