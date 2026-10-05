const reservations = [[1, 3], [6, 8], [10, 12]], insertion = [2, 11], merged = [];
let [start, end] = insertion, placed = false;
for (const interval of reservations) {
  if (interval[1] < start) merged.push(interval.slice());
  else if (interval[0] > end) { if (!placed) { merged.push([start, end]); placed = true; } merged.push(interval.slice()); }
  else { start = Math.min(start, interval[0]); end = Math.max(end, interval[1]); }
}
if (!placed) merged.push([start, end]);
console.log(JSON.stringify(merged) + ':' + reservations.length);
