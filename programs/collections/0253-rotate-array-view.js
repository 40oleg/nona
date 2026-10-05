const items = ["a","b","c","d","e"];
const starts = [3,0,4];
const pages = starts.map(start => {
  return Array.from({length:3},(_,offset) => items[(start+offset)%items.length]);
});
const combined = pages.flat();
const counts = new Map();
for (const item of combined) counts.set(item,(counts.get(item)||0)+1);
const result = {pages,counts:Array.from(counts)};
console.log(JSON.stringify(result));
