const grid = [[0,1,0],[1,1,0],[0,0,1]];
const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
const counts = grid.map((row,r)=>row.map((value,c)=>{
  return offsets.reduce((sum,[dr,dc])=>sum+(grid[r+dr]?.[c+dc]??0),0);
}));
const crowded = [];
for (let r=0;r<counts.length;r++) for (let c=0;c<counts[r].length;c++) {
  if (counts[r][c]>=2) crowded.push([r,c]);
}
console.log(JSON.stringify({counts,crowded}));
