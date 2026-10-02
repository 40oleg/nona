# Calculadora de matrizes

[`examples/compat/matrix-calculator.cjs`](https://github.com/40oleg/nona/blob/main/examples/compat/matrix-calculator.cjs) soma, subtrai e multiplica duas matrizes, transpõe A e calcula o determinante e a inversa de A. Usa apenas a linguagem e `console.log`, então o mesmo programa roda no Node.js e como executável do Nona.

## Compilar e executar

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

## Alterar a entrada

Edite as matrizes no fim do código-fonte e compile de novo:

```js
const A = [[2, 1], [1, 1]];
const B = [[3, 4], [5, 6]];
```

Cada array interno é uma linha. As matrizes precisam ser não vazias, retangulares e conter números finitos. Soma e subtração exigem tamanhos iguais; a multiplicação exige tantas colunas em A quanto linhas em B; o determinante e a inversa exigem que A seja quadrada. Um erro em uma operação não interrompe as outras.

## Cálculo numérico

O determinante e a inversa usam eliminação de Gauss-Jordan com pivotamento parcial em binary64. Se um pivô não for maior que `1e-12` vezes o maior valor absoluto da entrada, o programa informa determinante zero e ausência de inversa. É um limite numérico: ele pode rejeitar uma matriz mal condicionada que é invertível em aritmética exata.

## Verificação

```sh
node scripts/check-matrix-calculator.mjs
```

O script compila o exemplo e uma variante com asserções, executa os dois executáveis e compara a saída padrão, a saída de erro e os códigos de saída com o Node.js: resultados das operações, matrizes retangulares, trocas de linhas, matrizes 1×1 e 3×3, matrizes singulares e oito entradas inválidas.
