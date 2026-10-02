# Calculatrice matricielle

[`examples/compat/matrix-calculator.cjs`](https://github.com/40oleg/nona/blob/main/examples/compat/matrix-calculator.cjs) additionne, soustrait et multiplie deux matrices, transpose A et calcule le déterminant et l’inverse de A. Il n’utilise que le langage et `console.log` ; le même programme fonctionne donc sous Node.js et en tant qu’exécutable Nona.

## Compiler et exécuter

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

## Modifier l’entrée

Modifiez les matrices à la fin du source et recompilez :

```js
const A = [[2, 1], [1, 1]];
const B = [[3, 4], [5, 6]];
```

Chaque tableau intérieur est une ligne. Les matrices doivent être non vides, rectangulaires et contenir des nombres finis. L’addition et la soustraction exigent des tailles égales ; la multiplication exige autant de colonnes dans A que de lignes dans B ; le déterminant et l’inverse exigent une matrice A carrée. Une erreur dans une opération n’arrête pas les autres.

## Calcul numérique

Le déterminant et l’inverse utilisent l’élimination de Gauss-Jordan avec pivot partiel en binary64. Si un pivot n’est pas supérieur à `1e-12` fois la plus grande valeur absolue de l’entrée, le programme indique un déterminant nul et l’absence d’inverse. Il s’agit d’un seuil numérique : il peut rejeter une matrice mal conditionnée qui est inversible en arithmétique exacte.

## Vérification

```sh
node scripts/check-matrix-calculator.mjs
```

Le script compile l’exemple et une variante avec assertions, exécute les deux exécutables et compare la sortie standard, la sortie d’erreur et les codes de sortie avec Node.js : résultats des opérations, matrices rectangulaires, échanges de lignes, matrices 1×1 et 3×3, matrices singulières et huit entrées invalides.
