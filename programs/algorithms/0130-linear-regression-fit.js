const observations = [[0, 1], [1, 3], [2, 5], [3, 8]];
let sx = 0, sy = 0, sxx = 0, sxy = 0;
for (const [x, y] of observations) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
const n = observations.length, slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), intercept = (sy - slope * sx) / n;
const residual = observations.reduce((sum, [x, y]) => sum + (y - intercept - slope * x) ** 2, 0);
console.log([slope, intercept, residual].map(x => Math.round(x * 1000) / 1000).join(','));
