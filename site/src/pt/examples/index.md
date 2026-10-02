# Exemplos

## Passo a passo

| Exemplo | Mostra | Alvos |
| --- | --- | --- |
| [Olá, timers](/pt/examples/hello) | funções, template literals, microtasks e timers | Windows, Linux |
| [Museum: trocador de papel de parede](/pt/examples/museum) | `nona:win32`, timers, `node:fs`, `process`, um executável gráfico com recursos | Windows |
| [Calculadora de matrizes](/pt/examples/matrix-calculator) | código ES2020 comum com arrays e exceções | Windows, Linux |
| [Contagem de palavras](/pt/examples/word-count) | `node:fs`, `process.argv`, `process.exitCode`, `Map`, RegExp Unicode | Windows, Linux |

## Exemplos do repositório

O diretório [`examples`](https://github.com/40oleg/nona/tree/main/examples) tem programas pequenos (`factorial.js`, `fibonacci.js`, `loops.js`, `strings.js`, `modern-expressions-demo.js`). [`examples/compat`](https://github.com/40oleg/nona/tree/main/examples/compat) reúne mais de 80 programas, um por área da linguagem ou da biblioteca, que `npm run compare` compila e compara com a saída do Node.js.

## Compilar qualquer exemplo

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

Os exemplos deste site ficam em [`site/samples`](https://github.com/40oleg/nona/tree/main/site/samples); a CI compila cada um deles para os seus alvos.
