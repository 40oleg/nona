// Multiply rectangular matrices with typed rows and three loop levels.
function multiply(left, right) {
  const result = [];
  for (let row = 0; row < left.length; row++) {
    const values = new Int32Array(right[0].length);
    for (let column = 0; column < right[0].length; column++) {
      let sum = 0;
      for (let k = 0; k < right.length; k++) sum += left[row][k] * right[k][column];
      values[column] = sum;
    }
    result.push(values);
  }
  return result;
}

const product = multiply([[1, 2, 3], [4, 5, 6]], [[7, 8], [9, 10], [11, 12]]);
let checksum = 0;
for (let i = 0; i < product.length; i++) {
  console.log(product[i].join(','));
  for (let j = 0; j < product[i].length; j++) checksum += product[i][j];
}
console.log(checksum);
