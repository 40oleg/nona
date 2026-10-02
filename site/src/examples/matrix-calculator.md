# Matrix calculator

[`examples/compat/matrix-calculator.cjs`](https://github.com/40oleg/nona/blob/main/examples/compat/matrix-calculator.cjs) adds, subtracts and multiplies two matrices, transposes A and computes the determinant and inverse of A. It uses only the language and `console.log`, so the same program runs under Node.js and as a Nona executable.

## Build and run

::: code-group

```sh [Windows]
node dist/cli.js build examples/compat/matrix-calculator.cjs -o build/matrix-calculator.exe
.\build\matrix-calculator.exe
```

```sh [Linux]
node dist/cli.js build examples/compat/matrix-calculator.cjs -o build/matrix-calculator --target linux-x64
./build/matrix-calculator
```

:::

```text
A:
2  1
1  1
B:
3  4
5  6
Transpose A:
2  1
1  1
A + B:
5  5
6  7
…
```

## Changing the input

Edit the matrices at the end of the source and build again:

```js
const A = [[2, 1], [1, 1]];
const B = [[3, 4], [5, 6]];
```

Each inner array is a row. Matrices must be non-empty, rectangular and contain finite numbers. Addition and subtraction need equal sizes; multiplication needs as many columns in A as rows in B; the determinant and inverse need a square A. An error in one operation does not stop the others.

## Numerics

The determinant and inverse use Gauss–Jordan elimination with partial pivoting in binary64. If a pivot is not larger than `1e-12` times the largest absolute input value, the program reports a zero determinant and no inverse. This is a numerical threshold: it can reject an ill-conditioned matrix that is invertible in exact arithmetic.

## Verification

```sh
node scripts/check-matrix-calculator.mjs
```

The script compiles the example and a variant with assertions, runs both executables and compares standard output, standard error and exit codes with Node.js: operation results, rectangular matrices, row swaps, 1×1 and 3×3 matrices, singular matrices and eight invalid inputs.
