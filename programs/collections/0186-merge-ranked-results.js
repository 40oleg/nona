const searches = [[{id:"a",score:3},{id:"b",score:8}],[{id:"a",score:9},{id:"c",score:6}]];
const best = new Map();
for (const search of searches) {
  for (const result of search) {
    best.set(result.id,Math.max(best.get(result.id)||0,result.score));
  }
}
const ranked = Array.from(best);
ranked.sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
console.log(JSON.stringify(ranked));
