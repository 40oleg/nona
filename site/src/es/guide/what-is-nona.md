# Qué es Nona

Nona es un compilador ahead-of-time (AOT) para JavaScript. Lee un script o un grafo de módulos ES, lo comprueba, lo traduce a su propia representación intermedia, genera código máquina x86-64 y enlaza un ejecutable autónomo: una imagen PE32+ para Windows o una imagen ELF64 para Linux.

El compilador está escrito en TypeScript y se ejecuta sobre Node.js. Los programas que produce, no: no contienen intérprete, ni V8, ni bytecode. Un ejecutable de Windows solo importa `KERNEL32.dll` (además de las DLL que el programa llama mediante [FFI](/es/reference/ffi)); un ejecutable de Linux hace llamadas al sistema directamente y no usa libc.

## Qué obtienes

- **El lenguaje ES2020.** Clases y `super`, generadores, funciones async y generadores async, `for await`, desestructuración, spread, encadenamiento opcional, `??`, BigInt, Symbols, iteradores, llamadas de cola propias, `with` en modo no estricto y la semántica de compatibilidad web del Annex B.
- **Módulos ES.** `import`/`export` estáticos, ciclos y enlaces vivos, `import.meta` e `import()` dinámico de módulos conocidos en tiempo de compilación. Las entradas `.mjs` se compilan como módulos.
- **La biblioteca estándar de ES2020.** Object, Function, Array, String, Number, Math, Date, JSON, RegExp (grupos con nombre, lookbehind, flags `s` y `u`, escapes de propiedades Unicode), Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView y todos los typed arrays, SharedArrayBuffer y Atomics, Proxy y Reflect, y Promise con una cola de tareas.
- **`eval` y `Function` con código fuente conocido en tiempo de compilación.** Un literal de cadena, una concatenación de literales o una variable que solo recibe esas constantes se compila de antemano con la semántica completa de `eval` directo e indirecto.
- **Un runtime nativo.** Un recolector de basura mark-and-sweep preciso y sin movimiento de objetos, cadenas UTF-16, excepciones reales y un `RangeError` capturable ante un desbordamiento de pila.
- **APIs del host** para programas reales: un [bucle de eventos con temporizadores](/es/reference/host-apis), un [`process`](/es/reference/process) global, [`node:fs`](/es/reference/fs) síncrono con `TextEncoder`/`TextDecoder`, y [llamadas a funciones nativas](/es/reference/ffi) con declaraciones `nona:win32` listas para usar.
- **Arranque rápido y huella pequeña.** Un hello world compilado arranca en unos 2 ms, alcanza como máximo 11 MB de memoria y es un archivo de 3 MB: no hay runtime que iniciar ni JIT que calentar ([Rendimiento](/es/guide/performance)).
- **Ejecutables de Windows** sin ventana de consola, con icono, manifiesto e información de versión ([Ejecutables de Windows](/es/reference/windows-executables)).

## Qué no es Nona

- **No es un sustituto de Node.js.** No hay `require`, ni paquetes npm, ni APIs de Node.js más allá de los [subconjuntos de `fs` y `process`](/es/reference/modules). Tampoco están disponibles las APIs del navegador.
- **No es una implementación completa de ES2020.** Nona implementa ES2020 con excepciones documentadas; consulta [Soporte del lenguaje](/es/guide/language-support) y [Compatibilidad y limitaciones](/es/guide/compatibility).
- **No genera código en tiempo de ejecución.** `eval` y `Function` necesitan código fuente conocido en tiempo de compilación; las cadenas calculadas en tiempo de ejecución lanzan `EvalError`.
- **Todavía no es rápido calculando.** Sin JIT, las llamadas, el acceso a propiedades y la asignación de memoria son de 20 a 100 veces más lentos que en V8, y `Map`/`Set`, `sort`, la construcción de cadenas y las cadenas largas de Promise siguen siendo superlineales respecto al tamaño de los datos ([Rendimiento](/es/guide/performance)).
- **No es portable más allá de x86-64.** Los destinos son Windows 10/11 x64 y Linux x86-64.

## Seguridad

Nona no ha pasado una auditoría de seguridad. No compiles código fuente no confiable y no trates los ejecutables generados como un sandbox: se ejecutan con los mismos permisos que cualquier otro programa nativo, y FFI puede llamar a cualquier DLL.

## Siguientes pasos

- [Primeros pasos](/es/guide/getting-started): compila el compilador y tu primer programa.
- [Cómo funciona](/es/guide/how-it-works): el pipeline, el runtime y los enlazadores.
- [Ejemplos](/es/examples/): desde un hello world hasta un cambiador de fondos de pantalla.
