# Primeros pasos

## Requisitos

- Para ejecutar el compilador: Node.js 26 o posterior y npm, en Windows o Linux.
- Destinos: Windows 10/11 x64 (`win32-x64`, el predeterminado) y Linux x86-64 (`linux-x64`).

## Compilar el compilador

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

El punto de entrada del compilador es `dist/cli.js`; los ejemplos de este sitio lo ejecutan como `node dist/cli.js`. El paquete también declara un comando `nona`: `npm link` en el repositorio lo añade a tu `PATH`.

## Tu primer programa

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

El programa termina cuando no quedan temporizadores ni tareas de Promise. El ejecutable funciona por sí solo: cópialo a una máquina sin Node.js y seguirá funcionando.

## Destinos y compilación cruzada

El compilador es un compilador cruzado: en Windows puede producir ejecutables de Linux y en Linux puede producir ejecutables de Windows. `--target` selecciona el formato de salida; el predeterminado es `win32-x64`. Las salidas de Linux se escriben con modo `0755`.

## Módulos

Una entrada `.mjs`, o cualquier entrada compilada con `--module`, es un módulo ES. Las importaciones relativas (`./util.mjs`, `../lib/x.mjs`) se resuelven junto al archivo que importa y se compilan en el mismo ejecutable. Los módulos integrados usan el prefijo `nona:` (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`), y `node:fs` y `node:process` son alias de los subconjuntos de Nona; consulta [Módulos integrados](/es/reference/modules).

## Un programa de Windows sin consola

```sh
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` inicia el programa sin ventana de consola e incrusta un manifiesto predeterminado; `--icon` y `--version-info` añaden recursos que muestra el Explorador. Consulta [Ejecutables de Windows](/es/reference/windows-executables) y el [ejemplo Museum](/es/examples/museum).

## Solución de problemas

Los errores de compilación se muestran como `file:line:column CODE: message` y el compilador termina con estado 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- La sintaxis no soportada se rechaza en tiempo de compilación en lugar de fallar en tiempo de ejecución.
- `E_FFI_TARGET` significa que se compiló una declaración de DLL para `linux-x64` (o una llamada al sistema para `win32-x64`).
- Un `EvalError` en tiempo de ejecución significa que `eval` o `Function` recibió código fuente que no se conocía en tiempo de compilación.

La [referencia de la línea de comandos](/es/reference/cli) enumera todas las opciones y errores.
