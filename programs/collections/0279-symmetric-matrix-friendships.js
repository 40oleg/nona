const names = ["Ada","Bo","Cy","Dee"];
const index = new Map(names.map((name,i)=>[name,i]));
const matrix = names.map(()=>Array.from({length:names.length},()=>0));
for (const [a,b] of [["Ada","Bo"],["Bo","Cy"],["Ada","Dee"]]) {
  matrix[index.get(a)][index.get(b)] = 1;
  matrix[index.get(b)][index.get(a)] = 1;
}
const degrees = matrix.map(row=>row.reduce((a,b)=>a+b,0));
const result = {names,matrix,degrees};
console.log(JSON.stringify(result));
