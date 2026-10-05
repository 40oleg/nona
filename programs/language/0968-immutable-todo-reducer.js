function update(tasks,{id,...changes}) {
  return tasks.map(task => {
    if (task.id !== id) return task;
    const next = {...task,...changes};
    if (changes.toggle) { next.done = !task.done; delete next.toggle; }
    return next;
  });
}
const before = [{id:1,name:'write',done:false},{id:2,name:'read',done:false}];
const after = update(update(before,{id:1,toggle:true}),{id:2,name:'review'});
console.log(JSON.stringify({before,after}));
