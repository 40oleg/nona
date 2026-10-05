const matrix = [["a","b","c"],["d","e","f"],["g","h","i"]];
let top=0,bottom=2,left=0,right=2;
const order = [];
while (top<=bottom && left<=right) {
  for (let c=left;c<=right;c++) order.push(matrix[top][c]);
  top++;
  for (let r=top;r<=bottom;r++) order.push(matrix[r][right]);
  right--;
  if (top<=bottom) { for (let c=right;c>=left;c--) order.push(matrix[bottom][c]); bottom--; }
  if (left<=right) { for (let r=bottom;r>=top;r--) order.push(matrix[r][left]); left++; }
}
console.log(order.join(""));
