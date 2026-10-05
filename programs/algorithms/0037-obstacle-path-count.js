const rows = ['....', '.#..', '...#', '....'];
const paths = new Uint32Array(4); paths[0] = 1;
for (const row of rows) {
  for (let x = 0; x < row.length; x++) {
    if (row[x] === '#') paths[x] = 0;
    else if (x > 0) paths[x] += paths[x - 1];
  }
}
if (paths[3] !== 4) throw new Error('obstacle routes');
console.log(Array.from(paths).join(','));
