# API de process

::: info Traducción
Esta página es una traducción de la página en inglés [Process API](/reference/process), generada a partir de [`docs/process.md`](https://github.com/40oleg/nona/blob/main/docs/process.md). La versión en inglés es la de referencia y puede ser más reciente.
:::

`process` es un objeto global (como en Node.js), disponible también como exportación por defecto de `node:process` y `nona:process`, que además exportan `argv`, `env`, `platform`, `arch`, `pid`, `execPath`, `exit` y `cwd`.

| Miembro | Notas |
| --- | --- |
| `argv` | `[execPath, ...arguments]`. No hay ruta de script: `argv[1]` es el primer argumento (Node.js pone ahí la ruta del script). En Windows, la línea de comandos se divide con las reglas de `CommandLineToArgvW`. |
| `env` | Un objeto plano con una instantánea del entorno en el primer acceso. Los cambios no se transmiten al sistema operativo. En Windows se omiten las entradas ocultas del tipo `=C:`. |
| `exit(code?)` | Termina inmediatamente con `code`, o con `process.exitCode` (por defecto 0). |
| `exitCode` | Se usa como estado de salida cuando el programa termina con normalidad. |
| `execPath` | Ruta absoluta del ejecutable en ejecución. |
| `cwd()` | Directorio de trabajo actual. |
| `platform`, `arch`, `pid` | `'win32'` o `'linux'`, `'x64'`, el id del proceso. |

`process` se construye de forma perezosa en el primer acceso, así que los programas que no lo usan no pagan nada al arrancar. A diferencia de Node.js, no es un EventEmitter y no tiene los streams `stdout`/`stdin`, `nextTick`, `hrtime` ni `memoryUsage`.

Implementación: cada imagen contiene las funciones del host de ambos destinos, de modo que un mismo programa generado se puede enlazar como PE y como ELF; cada enlazador vincula las importaciones del otro destino a un stub que devuelve 0. En Windows se leen `GetCommandLineW`, `GetEnvironmentStringsW`, `GetModuleFileNameW` y `GetCurrentDirectoryW` mediante thunks FFI que el compilador instala para su propio preludio; en Linux se leen `/proc/self/cmdline`, `/proc/self/environ` y `/proc/self/exe` y se llama directamente a `getcwd`/`exit_group`.
