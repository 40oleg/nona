# Cómo funciona

## Pipeline

```text
JavaScript source (script or module graph)
      │
      ▼
 lexer → parser → early errors and scope binding → compile-time eval/Function
                                                         │
                                                         ▼
                                     IR lowering → x86-64 code generation
                                                         │
                                                         ▼
                       runtime (native code + JS preludes) → PE32+/ELF64/Mach-O64 linker
```

Todo se ejecuta dentro del proceso del compilador; no hay ensamblador, enlazador ni compilador de C externos. El resultado es un único archivo que contiene el código máquina del programa y el runtime de Nona.

## Frontend

[`src/frontend`](https://github.com/40oleg/nona/tree/main/src/frontend) convierte el texto fuente en un programa enlazado:

- `lexer.ts`, `parser.ts` y `ast.ts` producen el árbol sintáctico; la sintaxis no soportada es un error de compilación.
- `binder.ts` y `declarations.ts` aplican los errores tempranos, resuelven cada identificador a un ámbito (global, de módulo, de función, de bloque, objeto `with`) y deciden qué enlaces viven en clausuras.
- `modules.ts` carga el grafo de módulos: importaciones estáticas, `import()` con especificadores literales, ciclos y resolución de exportaciones. `builtin-modules.ts` y `fs-module.ts` proporcionan los módulos `nona:*` y `node:*`.
- `eval-aot.ts` y `dynamic-functions.ts` compilan las llamadas a `eval` y `Function` cuyo texto fuente se conoce en tiempo de compilación.

## Representación intermedia

[`src/ir`](https://github.com/40oleg/nona/tree/main/src/ir) traduce el programa enlazado a una IR de tipo registro formada por bloques, operaciones y terminadores (`lower.ts`, `model.ts`) y calcula la vida de las variables (`liveness.ts`) para que el recolector de basura solo vea valores vivos en cada safepoint.

## Generación de código

[`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) contiene un codificador de instrucciones y un ensamblador x86-64, además del generador de código, que convierte las operaciones de la IR en llamadas al runtime y rutas rápidas en línea. El código generado y el runtime siguen la convención de llamada Win64 en ambos destinos.

## Runtime

Cada ejecutable contiene el runtime de [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime):

- Los **valores** son pares etiquetados de 16 bytes: undefined, null, booleanos, números binary64, cadenas UTF-16, objetos, símbolos y BigInts.
- Los **objetos** creados por literales y constructores comparten *shapes* (clases ocultas): sus propiedades viven en ranuras de 16 bytes que describe la shape, y las cachés en línea del código generado las leen y escriben tras una sola comparación de shape. Lo que una shape no puede describir (accesores, borrado, otros atributos, claves símbolo) convierte el objeto en una lista ordenada de propiedades, que obtiene un índice hash cuando crece.
- El **código nativo** de los objetos integrados se emite como x86-64 con un pequeño constructor (`RuntimeBuilder`).
- Los **preludios de JavaScript** (`*-source.ts`) implementan partes de la biblioteca en JavaScript y se compilan en cada ejecutable: el motor de RegExp, los controladores de Promise y async, los auxiliares de Proxy y Reflect, los temporizadores y el bucle de eventos, `process`, `TextEncoder`/`TextDecoder` y los objetos integrados del Annex B.

### Recolector de basura

El recolector es preciso y no mueve objetos: mark-and-sweep sobre raíces explícitas (globales, ranuras de pila vivas en los safepoints, ámbitos raíz del runtime). Las pilas de corrutinas de generadores y funciones async (1 MiB cada una) cuentan para el umbral de recolección. En Linux, los bloques del heap provienen de clases de tamaño recortadas de arenas de 1 MiB. El contrato interno de memoria se describe en [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md) (en ruso).

### Excepciones, corrutinas y el bucle de eventos

- Las excepciones desenrollan los marcos nativos con datos de unwind reales; un desbordamiento de pila lanza un `RangeError` capturable.
- Los generadores y las funciones async se ejecutan en sus propias pilas y cambian de contexto en `yield` y `await`.
- Tras el programa de nivel superior, el punto de entrada ejecuta el bucle de eventos: vacía las tareas de Promise, espera al siguiente temporizador sin usar la CPU y termina cuando no queda nada ([detalles](/es/reference/host-apis)).

## Enlazado

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)): secciones, la tabla de importaciones (KERNEL32 para el runtime, más las DLL declaradas con FFI), reubicaciones base, datos de unwind y recursos (icono, manifiesto, información de versión).
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf), [`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux)): cada función de KERNEL32 que usa el runtime tiene un shim de llamada al sistema de Linux con la misma convención de llamada, de modo que el código del runtime se comparte entre destinos.

## FFI

Una llamada `define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` se resuelve en tiempo de compilación: la declaración se convierte en una entrada de la tabla de importaciones PE y en un thunk nativo que convierte valores de JavaScript, sigue la ABI de Win64 y captura `GetLastError`. En Linux, `define('syscall', '1', …)` declara una llamada al sistema directa. Consulta [Funciones nativas (FFI)](/es/reference/ffi).

## Estructura del repositorio

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux: system-call shims
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## Plataformas nativas

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Plataformas nativas](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.

## Formal verification prototype

[Lean proofs](https://github.com/40oleg/nona/blob/main/docs/formal-verification.md) cover selected slot move rules and a modeled straight-line dead-move optimizer. Run `npm run check:proofs` with Lean/elan installed. The production compiler, CFG analysis and native runtime are outside the current formal guarantee.
