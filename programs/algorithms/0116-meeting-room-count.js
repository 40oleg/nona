const meetings = [[0, 3], [1, 2], [2, 4], [3, 5]], events = [];
for (const [start, end] of meetings) events.push([start, 1], [end, -1]);
events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
let active = 0, peak = 0;
for (const [time, change] of events) { active += change; peak = Math.max(peak, active); if (active < 0) throw new Error('unbalanced event'); }
if (active !== 0) throw new Error('unfinished meeting');
console.log(peak);
