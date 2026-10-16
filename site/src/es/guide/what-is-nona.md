# Qué es Nona

Nona es un compilador ahead-of-time (AOT) para JavaScript. Lee un script o un grafo de módulos ES, lo comprueba, lo traduce a su propia representación intermedia, genera código máquina x86-64 o AArch64 y enlaza una salida PE32+, ELF64 o Mach-O64.

El compilador está escrito en TypeScript. Se ejecuta sobre Node.js o como el ejecutable nativo `nona` publicado, que Nona construyó a partir del código fuente del propio compilador. Los programas que produce no necesitan ninguno de los dos: no contienen intérprete, ni V8, ni bytecode. Un ejecutable de Windows solo importa `KERNEL32.dll` (además de las DLL que el programa llama mediante [FFI](/es/reference/ffi)); un ejecutable de Linux hace llamadas al sistema directamente y no usa libc.

## Qué obtienes

- **El lenguaje ES2020.** Clases y `super`, generadores, funciones async y generadores async, `for await`, desestructuración, spread, encadenamiento opcional, `??`, BigInt, Symbols, iteradores, llamadas de cola propias, `with` en modo no estricto y la semántica de compatibilidad web del Annex B.
- **Módulos ES.** `import`/`export` estáticos, ciclos y enlaces vivos, `import.meta` e `import()` dinámico de módulos conocidos en tiempo de compilación. Las entradas `.mjs` se compilan como módulos.
- **La biblioteca estándar de ES2020.** Object, Function, Array, String, Number, Math, Date, JSON, RegExp (grupos con nombre, lookbehind, flags `s` y `u`, escapes de propiedades Unicode), Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView y todos los typed arrays, SharedArrayBuffer y Atomics, Proxy y Reflect, y Promise con una cola de tareas.
- **`eval` y `Function` con código fuente conocido en tiempo de compilación.** Un literal de cadena, una concatenación de literales o una variable que solo recibe esas constantes se compila de antemano con la semántica completa de `eval` directo e indirecto.
- **Un runtime nativo.** Un recolector de basura mark-and-sweep preciso y sin movimiento de objetos, cadenas UTF-16, excepciones reales y un `RangeError` capturable ante un desbordamiento de pila.
- **APIs del host al estilo Node.js** para programas reales: un [bucle de eventos con temporizadores](/es/reference/host-apis), [`process`](/es/reference/process), [`node:fs`](/es/reference/fs), `path`, `Buffer`, streams, events, `URL`, [HTTP y TCP](/reference/network), y [llamadas a funciones nativas](/es/reference/ffi) con declaraciones `nona:win32` listas para usar. [Módulos integrados](/es/reference/modules) los enumera todos.
- **Ocho destinos.** Windows, Linux y macOS en x64 y ARM64, FreeBSD y OpenBSD en x64, con compilación cruzada desde cualquier host ([Plataformas nativas](/reference/native-platforms)).
- **Paquetes npm.** Los paquetes de `node_modules` se resuelven al construir y se compilan dentro del ejecutable ([paquetes npm](/reference/npm)).
- **Arranque rápido y huella pequeña.** Un hello world compilado arranca en unos 2 ms, alcanza como máximo 11 MB de memoria y es un archivo de unos 2 MB (hasta 7 MB cuando un programa llega a todas las partes opcionales del runtime): no hay runtime que iniciar ni JIT que calentar ([Rendimiento](/es/guide/performance)).
- **Ejecutables de Windows** sin ventana de consola, con icono, manifiesto e información de versión ([Ejecutables de Windows](/es/reference/windows-executables)).

## Qué no es Nona

- **No es un sustituto de Node.js.** Los paquetes npm se compilan dentro del programa al construirlo ([paquetes npm](/reference/npm)), pero solo están disponibles las [APIs de Node.js que implementa Nona](/es/reference/modules), y los paquetes que necesitan otras (`zlib`, `child_process`), `Intl` (salvo `Intl.Segmenter`) o complementos nativos no funcionan. Tampoco están disponibles las APIs del navegador.
- **No es una implementación completa de ES2020.** Nona implementa ES2020 con excepciones documentadas; consulta [Soporte del lenguaje](/es/guide/language-support) y [Compatibilidad y limitaciones](/es/guide/compatibility).
- **No genera código en tiempo de ejecución.** `eval` y `Function` necesitan código fuente conocido en tiempo de compilación; las cadenas calculadas en tiempo de ejecución lanzan `EvalError`.
- **No es tan rápido como V8 calculando.** Sin JIT, las llamadas, las clausuras y la asignación de memoria son de varias a decenas de veces más lentas que en V8, y las cadenas largas de Promise y la coincidencia de RegExp son los puntos más lentos ([Rendimiento](/es/guide/performance)).
- **No es idéntico en todas las plataformas.** Las APIs de sistema de archivos y de red, FFI y algunas funciones de `process` difieren según el destino; consulta [Plataformas nativas](/reference/native-platforms).

## Seguridad

Nona no ha pasado una auditoría de seguridad. No compiles código fuente no confiable y no trates los ejecutables generados como un sandbox: se ejecutan con los mismos permisos que cualquier otro programa nativo, y FFI puede llamar a cualquier DLL.

## Siguientes pasos

- [Primeros pasos](/es/guide/getting-started): instala el compilador y compila tu primer programa.
- [Cómo funciona](/es/guide/how-it-works): el pipeline, el runtime y los enlazadores.
- [Ejemplos](/es/examples/): desde un hello world hasta un cambiador de fondos de pantalla.
- [Soporte del lenguaje](/es/guide/language-support) y [Compatibilidad y limitaciones](/es/guide/compatibility): qué funciona y qué no.
- [Línea de comandos](/es/reference/cli) y [Módulos integrados](/es/reference/modules): la referencia.
