const events = [[7, 2], [9, 4], [0, 12], [3, 1]]; let level = 0, overflow = 0, shortage = 0;
const capacity = 10, trace = [];
for (const [inflow, demand] of events) {
  overflow += Math.max(0, level + inflow - capacity); level = Math.min(capacity, level + inflow);
  const delivered = Math.min(level, demand); level -= delivered; shortage += demand - delivered;
  trace.push(level);
}
if (level < 0 || level > capacity) throw new Error('reservoir bounds');
console.log(trace.join(',') + ':' + overflow + ':' + shortage);
