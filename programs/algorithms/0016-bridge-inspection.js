const links = [[1, 2], [0, 2], [0, 1, 3], [2]];
const entered = new Map(), low = new Map(), bridges = []; let tick = 0;
function inspect(v, parent) {
  entered.set(v, ++tick); low.set(v, tick);
  for (const to of links[v]) {
    if (to === parent) continue;
    if (!entered.has(to)) { inspect(to, v); low.set(v, Math.min(low.get(v), low.get(to))); if (low.get(to) > entered.get(v)) bridges.push([v, to]); }
    else low.set(v, Math.min(low.get(v), entered.get(to)));
  }
}
inspect(0, -1);
console.log(JSON.stringify(bridges));
