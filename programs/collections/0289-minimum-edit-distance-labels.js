const left = "bolt";
const right = "boat";
const table = Array.from({length:left.length+1},()=>new Array(right.length+1).fill(0));
for (let i=0;i<=left.length;i++) table[i][0]=i;
for (let j=0;j<=right.length;j++) table[0][j]=j;
for (let i=1;i<=left.length;i++) for (let j=1;j<=right.length;j++) {
  const replacement = table[i-1][j-1]+(left[i-1]===right[j-1]?0:1);
  table[i][j]=Math.min(table[i-1][j]+1,table[i][j-1]+1,replacement);
}
console.log(JSON.stringify([table[left.length][right.length],table[left.length]]));
