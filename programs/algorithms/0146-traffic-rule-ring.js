let road = [1, 0, 1, 1, 0, 0, 1, 0]; const history = [];
for (let tick = 0; tick < 5; tick++) {
  const next = Array(road.length).fill(0);
  for (let i = 0; i < road.length; i++) if (road[i]) { const target = (i + 1) % road.length; next[road[target] ? i : target] = 1; }
  if (next.reduce((a, b) => a + b, 0) !== 4) throw new Error('car count');
  road = next; history.push(road.join(''));
}
console.log(history.join('|'));
