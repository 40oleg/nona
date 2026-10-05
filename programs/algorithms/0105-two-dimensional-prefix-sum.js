const bins = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
const prefix = Array.from({length: 4}, () => Array(4).fill(0));
for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) prefix[y][x] = bins[y - 1][x - 1] + prefix[y - 1][x] + prefix[y][x - 1] - prefix[y - 1][x - 1];
function sum(x0, y0, x1, y1) { return prefix[y1][x1] - prefix[y0][x1] - prefix[y1][x0] + prefix[y0][x0]; }
if (sum(1, 1, 3, 3) !== 28) throw new Error('rectangle');
console.log(sum(0, 0, 3, 3) + ':' + sum(1, 1, 3, 3) + ':' + sum(2, 2, 2, 3));
