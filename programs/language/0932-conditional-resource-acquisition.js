const events = [];
function job(names) {
  const open = [];
  try {
    for (const name of names) {
      if (name === 'broken') throw new Error('acquire failed');
      events.push('open:'+name); open.push(() => events.push('close:'+name));
    }
  } finally { while (open.length) open.pop()(); }
}
try { job(['first','broken','last']); } catch(error) { events.push(error.message); }
console.log(JSON.stringify(events));
