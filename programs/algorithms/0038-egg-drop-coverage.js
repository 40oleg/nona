const eggs = 3, floors = 30, coverage = new Uint32Array(eggs + 1);
let moves = 0;
while (coverage[eggs] < floors) {
  moves++;
  for (let egg = eggs; egg > 0; egg--) coverage[egg] = coverage[egg] + coverage[egg - 1] + 1;
}
if (moves !== 6) throw new Error('trial bound');
console.log(moves + ':' + Array.from(coverage).join(','));
