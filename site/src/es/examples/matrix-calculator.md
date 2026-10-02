# Calculadora de matrices

[`examples/compat/matrix-calculator.cjs`](https://github.com/40oleg/nona/blob/main/examples/compat/matrix-calculator.cjs) suma, resta y multiplica dos matrices, traspone A y calcula el determinante y la inversa de A. Solo usa el lenguaje y `console.log`, así que el mismo programa funciona en Node.js y como ejecutable de Nona.

## Compilar y ejecutar

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

## Cambiar la entrada

Edita las matrices al final del código fuente y vuelve a compilar:

```js
const A = [[2, 1], [1, 1]];
const B = [[3, 4], [5, 6]];
```

Cada array interior es una fila. Las matrices no pueden estar vacías, deben ser rectangulares y contener números finitos. La suma y la resta necesitan tamaños iguales; la multiplicación necesita tantas columnas en A como filas en B; el determinante y la inversa necesitan que A sea cuadrada. Un error en una operación no detiene las demás.

## Cálculo numérico

El determinante y la inversa usan eliminación de Gauss-Jordan con pivoteo parcial en binary64. Si un pivote no es mayor que `1e-12` veces el mayor valor absoluto de la entrada, el programa informa de un determinante nulo y de que no hay inversa. Es un umbral numérico: puede rechazar una matriz mal condicionada que sí es invertible en aritmética exacta.

## Verificación

```sh
node scripts/check-matrix-calculator.mjs
```

El script compila el ejemplo y una variante con aserciones, ejecuta ambos ejecutables y compara la salida estándar, la salida de error y los códigos de salida con Node.js: resultados de las operaciones, matrices rectangulares, intercambios de filas, matrices 1×1 y 3×3, matrices singulares y ocho entradas no válidas.
