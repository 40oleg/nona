// Matrix calculator for Nona. Edit A and B at the bottom, then compile again.
// Input: nonempty rectangular arrays of finite numbers.
// No Node.js APIs are used; the compiled Windows EXE runs independently.

function abs(value) {
  return value < 0 ? -value : value;
}

function dimensions(matrix) {
  if (matrix === null || typeof matrix !== "object" || !(matrix.length > 0)) {
    throw new Error("Expected a nonempty matrix");
  }
  let columns = 0;
  for (let row = 0; row < matrix.length; row++) {
    const values = matrix[row];
    if (values === null || typeof values !== "object" || !(values.length > 0)) {
      throw new Error("Expected a nonempty row");
    }
    if (row === 0) columns = values.length;
    if (values.length !== columns) throw new Error("Rows must have equal lengths");
    for (let column = 0; column < columns; column++) {
      const value = values[column];
      if (typeof value !== "number" || value !== value || value === Infinity || value === -Infinity) {
        throw new Error("Matrix entries must be finite numbers");
      }
    }
  }
  return [matrix.length, columns];
}

function zeros(rows, columns) {
  const result = [];
  for (let row = 0; row < rows; row++) {
    result[row] = [];
    for (let column = 0; column < columns; column++) result[row][column] = 0;
  }
  return result;
}

function add(left, right, sign) {
  const a = dimensions(left);
  const b = dimensions(right);
  if (a[0] !== b[0] || a[1] !== b[1]) throw new Error("Addition requires equal dimensions");
  const result = zeros(a[0], a[1]);
  for (let row = 0; row < a[0]; row++) {
    for (let column = 0; column < a[1]; column++) {
      result[row][column] = left[row][column] + sign * right[row][column];
    }
  }
  return result;
}

function multiply(left, right) {
  const a = dimensions(left);
  const b = dimensions(right);
  if (a[1] !== b[0]) throw new Error("Multiplication requires A columns = B rows");
  const result = zeros(a[0], b[1]);
  for (let row = 0; row < a[0]; row++) {
    for (let column = 0; column < b[1]; column++) {
      for (let k = 0; k < a[1]; k++) result[row][column] += left[row][k] * right[k][column];
    }
  }
  return result;
}

function transpose(matrix) {
  const size = dimensions(matrix);
  const result = zeros(size[1], size[0]);
  for (let row = 0; row < size[0]; row++) {
    for (let column = 0; column < size[1]; column++) result[column][row] = matrix[row][column];
  }
  return result;
}

// Gauss-Jordan elimination with partial pivoting. The input is never changed.
// The relative tolerance is a practical numerical cutoff, not an exact rank test.
function eliminate(matrix) {
  const size = dimensions(matrix);
  const n = size[0];
  if (n !== size[1]) throw new Error("Determinant and inverse require a square matrix");
  const work = zeros(n, n);
  const inverse = zeros(n, n);
  let scale = 0;
  for (let row = 0; row < n; row++) {
    inverse[row][row] = 1;
    for (let column = 0; column < n; column++) {
      work[row][column] = matrix[row][column];
      if (abs(matrix[row][column]) > scale) scale = abs(matrix[row][column]);
    }
  }
  const tolerance = scale * 0.000000000001;
  let determinant = 1;
  for (let column = 0; column < n; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < n; row++) {
      if (abs(work[row][column]) > abs(work[pivotRow][column])) pivotRow = row;
    }
    if (abs(work[pivotRow][column]) <= tolerance) {
      return {determinant: 0, inverse: null};
    }
    if (pivotRow !== column) {
      let temporary = work[column];
      work[column] = work[pivotRow];
      work[pivotRow] = temporary;
      temporary = inverse[column];
      inverse[column] = inverse[pivotRow];
      inverse[pivotRow] = temporary;
      determinant = -determinant;
    }
    const pivot = work[column][column];
    determinant *= pivot;
    for (let k = 0; k < n; k++) {
      work[column][k] /= pivot;
      inverse[column][k] /= pivot;
    }
    for (let row = 0; row < n; row++) {
      if (row !== column) {
        const factor = work[row][column];
        for (let k = 0; k < n; k++) {
          work[row][k] -= factor * work[column][k];
          inverse[row][k] -= factor * inverse[column][k];
        }
      }
    }
  }
  return {determinant: determinant, inverse: inverse};
}

function printMatrix(title, matrix) {
  console.log(title);
  for (let row = 0; row < matrix.length; row++) console.log(matrix[row].join("  "));
}

// Change these matrices. A and B may also be rectangular.
const A = [[2, 1], [1, 1]];
const B = [[3, 4], [5, 6]];

try {
  printMatrix("A:", A);
  printMatrix("B:", B);
  printMatrix("Transpose A:", transpose(A));
} catch (error) {
  console.log("Input error:", error.message);
}
try {
  printMatrix("A + B:", add(A, B, 1));
  printMatrix("A - B:", add(A, B, -1));
} catch (error) {
  console.log("Addition/subtraction:", error.message);
}
try {
  printMatrix("A * B:", multiply(A, B));
} catch (error) {
  console.log("Multiplication:", error.message);
}
try {
  const result = eliminate(A);
  console.log("Determinant A:", result.determinant);
  if (result.inverse === null) {
    console.log("Inverse A: singular or too close to singular at the chosen tolerance");
  } else {
    printMatrix("Inverse A:", result.inverse);
    printMatrix("A * inverse(A):", multiply(A, result.inverse));
  }
} catch (error) {
  console.log("Determinant/inverse:", error.message);
}
