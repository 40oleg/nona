const allocated = [[1, 0], [0, 1], [1, 1]], maximum = [[2, 1], [1, 2], [2, 2]];
const available = [1, 1], done = [false, false, false], sequence = [];
while (sequence.length < 3) {
  let progress = false;
  for (let p = 0; p < 3; p++) {
    if (done[p] || !maximum[p].every((need, r) => need - allocated[p][r] <= available[r])) continue;
    allocated[p].forEach((amount, r) => { available[r] += amount; }); done[p] = true; sequence.push(p); progress = true;
  }
  if (!progress) break;
}
console.log((sequence.length === 3 ? 'safe:' : 'blocked:') + sequence.join(','));
