const eligible = [[0, 1], [0], [1, 2]], assigned = [-1, -1, -1];
function claim(person, visited) {
  for (const station of eligible[person]) {
    if (visited.has(station)) continue;
    visited.add(station);
    if (assigned[station] < 0 || claim(assigned[station], visited)) { assigned[station] = person; return true; }
  }
  return false;
}
let matched = 0;
for (let p = 0; p < eligible.length; p++) if (claim(p, new Set())) matched++;
console.log(matched + ':' + assigned.join(','));
