const delta = new Int32Array(7), bookings = [[1, 3, 4], [2, 5, 2], [5, 5, -1]];
for (const [first, last, seats] of bookings) { delta[first] += seats; delta[last + 1] -= seats; }
const totals = []; let active = 0;
for (let flight = 1; flight <= 5; flight++) { active += delta[flight]; totals.push(active); }
if (totals[4] !== 1 || active + delta[6] !== 0) throw new Error('boundary cancellation');
console.log(totals.join(','));
