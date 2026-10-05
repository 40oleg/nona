const available = [6,2,3,9,7,3,10];
const days = Array.from(new Set(available)).sort((a,b) => a-b);
const groups = [];
for (const day of days) {
  const last = groups[groups.length-1];
  if (last && day===last[last.length-1]+1) last.push(day);
  else groups.push([day]);
}
const spans = groups.map(group => [group[0],group[group.length-1]]);
console.log(JSON.stringify(spans));
