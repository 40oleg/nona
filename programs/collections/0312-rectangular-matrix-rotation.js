const matrix = [[1,2,3],[4,5,6]];
const height = matrix.length;
const width = matrix[0].length;
const rotated = Array.from({length:width},(_,row)=>{
  return Array.from({length:height},(_,col)=>matrix[height-1-col][row]);
});
const oldSum = matrix.flat().reduce((a,b)=>a+b,0);
const newSum = rotated.flat().reduce((a,b)=>a+b,0);
const preserved = oldSum===newSum;
console.log(JSON.stringify({rotated,preserved}));
