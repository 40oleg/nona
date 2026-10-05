const loads = [3, 2, 2, 4, 1], deadline = 3;
function days(capacity) {
  let count = 1, used = 0;
  for (const load of loads) { if (used + load > capacity) { count++; used = 0; } used += load; }
  return count;
}
let low = Math.max(...loads), high = loads.reduce((a, b) => a + b, 0);
while (low < high) { const mid = (low + high) >> 1; if (days(mid) <= deadline) high = mid; else low = mid + 1; }
if (days(low) > deadline || (low > Math.max(...loads) && days(low - 1) <= deadline)) throw new Error('minimal capacity');
console.log(low);
