const solutions = [];
for (let a = 1; a <= 9; a++) for (let b = 0; b <= 9; b++) {
  if (a === b) continue;
  const doubled = 2 * (10 * a + b);
  if (doubled < 100 || doubled >= 200) continue;
  const c = Math.floor(doubled / 10) % 10, d = doubled % 10;
  if (new Set([a, b, 1, c, d]).size !== 5) continue;
  solutions.push([10 * a + b, doubled]);
}
console.log(solutions.length + ':' + JSON.stringify(solutions.slice(0, 3)));
