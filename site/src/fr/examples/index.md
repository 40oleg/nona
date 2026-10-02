# Exemples

## Pas à pas

| Exemple | Ce qu’il montre | Cibles |
| --- | --- | --- |
| [Bonjour, minuteurs](/fr/examples/hello) | fonctions, gabarits de chaînes, microtâches et minuteurs | Windows, Linux |
| [Museum : changeur de fond d’écran](/fr/examples/museum) | `nona:win32`, minuteurs, `node:fs`, `process`, un exécutable graphique avec ressources | Windows |
| [Calculatrice matricielle](/fr/examples/matrix-calculator) | du code ES2020 ordinaire avec tableaux et exceptions | Windows, Linux |
| [Comptage de mots](/fr/examples/word-count) | `node:fs`, `process.argv`, `process.exitCode`, `Map`, RegExp Unicode | Windows, Linux |

## Exemples du dépôt

Le répertoire [`examples`](https://github.com/40oleg/nona/tree/main/examples) contient de petits programmes (`factorial.js`, `fibonacci.js`, `loops.js`, `strings.js`, `modern-expressions-demo.js`). [`examples/compat`](https://github.com/40oleg/nona/tree/main/examples/compat) regroupe plus de 80 programmes, un par domaine du langage ou de la bibliothèque, que `npm run compare` compile et confronte à la sortie de Node.js.

## Compiler n’importe quel exemple

::: code-group

```sh [Windows]
node dist/cli.js build examples/fibonacci.js -o build/fibonacci.exe
.\build\fibonacci.exe
```

```sh [Linux]
node dist/cli.js build examples/fibonacci.js -o build/fibonacci --target linux-x64
./build/fibonacci
```

:::

Les exemples de ce site se trouvent dans [`site/samples`](https://github.com/40oleg/nona/tree/main/site/samples) ; la CI compile chacun d’eux pour ses cibles.
