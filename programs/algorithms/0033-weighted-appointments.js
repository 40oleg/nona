const jobs = [[0, 3, 5], [2, 5, 8], [3, 6, 5], [6, 8, 4]].sort((a, b) => a[1] - b[1]);
const best = [0], chosen = [[]];
for (let i = 0; i < jobs.length; i++) {
  const [start, end, reward] = jobs[i]; let before = i - 1;
  while (before >= 0 && jobs[before][1] > start) before--;
  const take = best[before + 1] + reward;
  if (take > best[i]) { best.push(take); chosen.push([...chosen[before + 1], i]); }
  else { best.push(best[i]); chosen.push(chosen[i].slice()); }
}
console.log(best[jobs.length] + ':' + chosen[jobs.length].join(','));
