const matrix = [[1,2,3],[4,5,6],[7,8,9]];
const cells = new Set();
let sum = 0;
for (let row=0;row<matrix.length;row++) {
  for (const col of [row,matrix.length-1-row]) {
    const key = row+","+col;
    if (!cells.has(key)) { cells.add(key); sum+=matrix[row][col]; }
  }
}
const all = matrix.flat().reduce((a,b)=>a+b,0);
console.log(JSON.stringify({sum,other:all-sum,cells:cells.size}));
