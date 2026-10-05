const source = 'abbcccddddddeee';
const runs = [];
let start = 0;
for (let i = 1; i <= source.length; i++) {
  if (source[i] !== source[start]) {
    runs.push({ symbol: source[start], start, length: i - start });
    start = i;
  }
}
const ranked = runs.slice().sort((a, b) => b.length - a.length || a.start - b.start);
const longest = ranked[0];
console.log(JSON.stringify({ runs, longest }));
