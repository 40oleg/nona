# Ejemplos

## Recorridos guiados

| Ejemplo | Muestra | Destinos |
| --- | --- | --- |
| [Hola, temporizadores](/es/examples/hello) | funciones, plantillas literales, microtareas y temporizadores | Windows, Linux |
| [Museum: cambiador de fondos de pantalla](/es/examples/museum) | `nona:win32`, temporizadores, `node:fs`, `process`, un ejecutable gráfico con recursos | Windows |
| [Calculadora de matrices](/es/examples/matrix-calculator) | código ES2020 corriente con arrays y excepciones | Windows, Linux |
| [Conteo de palabras](/es/examples/word-count) | `node:fs`, `process.argv`, `process.exitCode`, `Map`, RegExp Unicode | Windows, Linux |

## Ejemplos del repositorio

El directorio [`examples`](https://github.com/40oleg/nona/tree/main/examples) contiene programas pequeños (`factorial.js`, `fibonacci.js`, `loops.js`, `strings.js`, `modern-expressions-demo.js`). [`examples/compat`](https://github.com/40oleg/nona/tree/main/examples/compat) reúne más de 80 programas que `npm run compare` compila y contrasta con la salida de Node.js, uno por cada área del lenguaje o de la biblioteca.

## Compilar cualquier ejemplo

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

Los ejemplos de este sitio están en [`site/samples`](https://github.com/40oleg/nona/tree/main/site/samples); la CI compila cada uno de ellos para sus destinos.
