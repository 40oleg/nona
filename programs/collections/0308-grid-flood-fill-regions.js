const grid = [[1,0,1],[1,0,1],[0,1,0]];
const seen = new Set();
const sizes = [];
for (let row=0;row<3;row++) for (let col=0;col<3;col++) {
  if (!grid[row][col] || seen.has(row+","+col)) continue;
  const queue = [[row,col]];
  seen.add(row+","+col);
  let size = 0;
  while (queue.length) {
    const [r,c] = queue.shift();
    size++;
    for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nr=r+dr,nc=c+dc,key=nr+","+nc;
      if (nr>=0&&nr<3&&nc>=0&&nc<3&&grid[nr][nc]&&!seen.has(key)) { seen.add(key); queue.push([nr,nc]); }
    }
  }
  sizes.push(size);
}
console.log(JSON.stringify(sizes));
