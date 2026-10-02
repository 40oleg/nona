# Примеры

## Разборы

| Пример | Что показывает | Цели |
| --- | --- | --- |
| [Hello и таймеры](/ru/examples/hello) | функции, шаблонные строки, микрозадачи и таймеры | Windows, Linux |
| [Museum: смена обоев](/ru/examples/museum) | `nona:win32`, таймеры, `node:fs`, `process`, GUI-программа с ресурсами | Windows |
| [Матричный калькулятор](/ru/examples/matrix-calculator) | обычный код ES2020 с массивами и исключениями | Windows, Linux |
| [Подсчёт слов](/ru/examples/word-count) | `node:fs`, `process.argv`, `process.exitCode`, `Map`, Unicode RegExp | Windows, Linux |

## Примеры в репозитории

В каталоге [`examples`](https://github.com/40oleg/nona/tree/main/examples) есть небольшие программы (`factorial.js`, `fibonacci.js`, `loops.js`, `strings.js`, `modern-expressions-demo.js`). В [`examples/compat`](https://github.com/40oleg/nona/tree/main/examples/compat) — больше 80 программ, по одной на область языка или библиотеки; `npm run compare` компилирует их и сверяет вывод с Node.js.

## Сборка любого примера

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

Примеры этого сайта лежат в [`site/samples`](https://github.com/40oleg/nona/tree/main/site/samples); CI компилирует каждый из них для его целей.
