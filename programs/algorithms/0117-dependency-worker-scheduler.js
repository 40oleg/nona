const tasks = [{id: 'a', time: 3, deps: []}, {id: 'b', time: 2, deps: []}, {id: 'c', time: 4, deps: ['a']}, {id: 'd', time: 1, deps: ['b', 'c']}];
const started = new Set(), done = new Set(), active = [], trace = []; let clock = 0;
while (done.size < tasks.length) {
  for (const task of tasks) if (active.length < 2 && !started.has(task.id) && task.deps.every(dep => done.has(dep))) { started.add(task.id); active.push({id: task.id, end: clock + task.time}); trace.push(task.id + '@' + clock); }
  if (!active.length) throw new Error('deadlock');
  active.sort((a, b) => a.end - b.end); clock = active[0].end;
  while (active.length && active[0].end === clock) done.add(active.shift().id);
}
console.log(clock + ':' + trace.join(','));
