const jobs = [{name: 'A', arrives: 0, left: 5}, {name: 'B', arrives: 1, left: 2}, {name: 'C', arrives: 2, left: 1}];
let tick = 0; const timeline = [], completion = [];
while (jobs.some(job => job.left > 0)) {
  const available = jobs.filter(job => job.arrives <= tick && job.left > 0).sort((a, b) => a.left - b.left || a.name.localeCompare(b.name));
  if (!available.length) { timeline.push('_'); tick++; continue; }
  const current = available[0]; current.left--; timeline.push(current.name); tick++;
  if (!current.left) completion.push(current.name + '@' + tick);
}
console.log(timeline.join('') + ':' + completion.join(','));
