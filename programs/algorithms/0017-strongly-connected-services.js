const routes = [[1], [2, 3], [0], [4], [3]];
const reverse = routes.map(() => []); routes.forEach((row, v) => row.forEach(w => reverse[w].push(v)));
const seen = new Set(), order = [];
function finish(v) { if (seen.has(v)) return; seen.add(v); for (const w of routes[v]) finish(w); order.push(v); }
for (let v = 0; v < routes.length; v++) finish(v);
seen.clear(); const groups = [];
function collect(v, group) { if (seen.has(v)) return; seen.add(v); group.push(v); for (const w of reverse[v]) collect(w, group); }
for (const v of order.reverse()) if (!seen.has(v)) { const group = []; collect(v, group); groups.push(group.sort((a, b) => a - b)); }
console.log(JSON.stringify(groups));
