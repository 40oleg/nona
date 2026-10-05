const rectangles = [[0, 0, 3, 2], [2, 1, 5, 3]], xs = [...new Set(rectangles.flatMap(r => [r[0], r[2]]))].sort((a, b) => a - b);
let area = 0;
for (let i = 1; i < xs.length; i++) {
  const intervals = rectangles.filter(r => r[0] <= xs[i - 1] && r[2] >= xs[i]).map(r => [r[1], r[3]]).sort((a, b) => a[0] - b[0]);
  let covered = 0, end = -Infinity;
  for (const [start, finish] of intervals) { covered += Math.max(0, finish - Math.max(start, end)); end = Math.max(end, finish); }
  area += covered * (xs[i] - xs[i - 1]);
}
if (area !== 11) throw new Error('overlap counted twice');
console.log(area);
