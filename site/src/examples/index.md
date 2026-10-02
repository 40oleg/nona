# Examples

## Walkthroughs

| Example | Shows | Targets |
| --- | --- | --- |
| [Hello, timers](/examples/hello) | functions, template literals, microtasks and timers | Windows, Linux |
| [Museum: wallpaper changer](/examples/museum) | `nona:win32`, timers, `node:fs`, `process`, a GUI executable with resources | Windows |
| [Matrix calculator](/examples/matrix-calculator) | plain ES2020 code with arrays and exceptions | Windows, Linux |
| [Word count](/examples/word-count) | `node:fs`, `process.argv`, `process.exitCode`, `Map`, Unicode RegExp | Windows, Linux |

## Repository examples

The [`examples`](https://github.com/40oleg/nona/tree/main/examples) directory has small programs (`factorial.js`, `fibonacci.js`, `loops.js`, `strings.js`, `modern-expressions-demo.js`). [`examples/compat`](https://github.com/40oleg/nona/tree/main/examples/compat) holds more than 80 programs that `npm run compare` compiles and checks against Node.js output, one per language or library area.

## Building any example

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

The samples on this site live in [`site/samples`](https://github.com/40oleg/nona/tree/main/site/samples); CI compiles every one of them for its targets.
