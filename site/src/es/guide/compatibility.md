# Compatibilidad y limitaciones

## Alcance

Nona apunta al lenguaje y los objetos integrados de la 11.ª edición normativa de ECMA-262 (junio de 2020), para scripts y módulos ES. La internacionalización ECMA-402, las APIs del navegador y las de Node.js son especificaciones aparte; Nona solo proporciona las APIs del host enumeradas en la [Referencia](/es/reference/modules). El contrato de completitud se mantiene en [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md). El `Intl` propio de Nona (ECMA-402) solo conoce la configuración regional `en`/`en-US`; las demás se reemplazan por ella y la zona horaria es UTC.

Una versión se describe como «ES2020 con excepciones documentadas», nunca como totalmente conforme con ES2020.

## `eval` y `Function` {#eval-and-function}

Nona compila de antemano, así que `eval` y los constructores dinámicos de funciones necesitan su texto fuente en tiempo de compilación:

- **Se compila de antemano:** un literal de cadena, una concatenación de literales o una variable a la que solo se asignan esas constantes (el valor se compara en tiempo de ejecución). El `eval` directo ve el ámbito del llamador, `this`, `arguments`, `new.target` y `super`; las formas indirectas (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) se ejecutan en el ámbito global. Las llamadas a `Function`, `GeneratorFunction`, `AsyncFunction` y `AsyncGeneratorFunction` cuyos argumentos son todos literales se compilan con la semántica de CreateDynamicFunction.
- **No soportado:** código calculado en tiempo de ejecución, argumentos spread para `eval` y `$262.evalScript`. Estos lanzan:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

El código en tiempo de ejecución se sigue en [#11](https://github.com/40oleg/nona/issues/11).

## Diferencias con Node.js

| Área                              | Nona                                                                                                                                                                      | Node.js                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `process.argv`                    | `[execPath, ...arguments]`: `argv[1]` es el primer argumento                                                                                                              | `[node, script, ...arguments]`                                                                            |
| `process`                         | Metadatos comunes, modificación del entorno, relojes y ticks, E/S estándar, ciclo de vida y advertencias, CPU y recursos y control nativo de procesos (los ocho destinos) | Manejadores de señales, IPC, informes del heap de V8, streams asíncronos completos y control del terminal |
| Ids de temporizador               | Números                                                                                                                                                                   | Objetos `Timeout`                                                                                         |
| `readFileSync(path)`              | Devuelve un `Uint8Array` (sin codificación)                                                                                                                               | Devuelve un `Buffer`                                                                                      |
| Codificaciones                    | `utf8` (fs); solo UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer)                                                                                         | Muchas                                                                                                    |
| Mensajes de error en Windows      | Contienen la ruta tal como se pasó                                                                                                                                        | Contienen la ruta absoluta                                                                                |
| Módulos                           | `nona:*`, los módulos `node:*` enumerados en [Módulos integrados](/es/reference/modules), archivos y paquetes npm resueltos al compilar                                   | Todo `node:*` y paquetes npm, resueltos en tiempo de ejecución                                            |
| `require`                         | Módulos CommonJS, con especificadores literales conocidos al compilar ([paquetes npm](/reference/npm))                                                                    | Cualquier especificador en tiempo de ejecución                                                            |
| `console.log` sin salida estándar | La salida se descarta                                                                                                                                                     | La salida se descarta o se produce un error                                                               |

## Rendimiento

- Los arrays, los objetos y `Map`/`Set` usan almacenamiento denso y hash con shapes y cachés en línea, pero las llamadas, las clausuras y la asignación de memoria siguen siendo varias veces más lentas que en V8; [Rendimiento](/es/guide/performance) enumera los puntos lentos.
- El motor de RegExp es una VM con backtracking escrita en JavaScript. Un patrón sin referencias inversas ni lookarounds que retrocede en exceso (sin el flag `u`) lo termina un motor de tiempo lineal.
- En Windows, los temporizadores se despiertan con el tick del sistema (normalmente 15,6 ms).
- No hay JIT: el código se compila una sola vez, de antemano, sin optimización guiada por perfiles.

## Partes del runtime enlazadas {#linked-runtime-parts}

Todo ejecutable contiene el runtime, pero sus partes opcionales grandes solo se enlazan cuando el programa puede alcanzarlas. El compilador lo decide a partir del texto de cada fuente que compila: el programa, sus módulos y las fuentes de `eval`/`Function` en tiempo de compilación:

| Parte                                              | Tamaño      | Se enlaza cuando una fuente contiene                                                                                                                         |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Motor de RegExp                                    | unos 1 MB   | un literal RegExp, o el nombre `RegExp`, `match`, `matchAll` o `search` (como identificador, nombre de propiedad o dentro de una cadena o plantilla literal) |
| Tablas de propiedades Unicode para `\p{…}`/`\P{…}` | unos 2 MB   | `\p{` o `\P{` en un literal RegExp o en una cadena, o uno de los nombres anteriores (un patrón puede construirse en tiempo de ejecución)                     |
| Tablas de normalización Unicode                    | unos 0,7 MB | el nombre `normalize` o `localeCompare`                                                                                                                      |

`split`, `replace` y `replaceAll` con argumentos de cadena no necesitan el motor de RegExp.

Las bibliotecas integradas escritas en JavaScript que solo instalan globales o métodos (unos 0,7 MB en total) se enlazan del mismo modo, cuando una fuente contiene uno de sus nombres:

| Parte                                                                                                                                                                  | Nombres                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Proxy`                                                                                                                                                                | `Proxy`                                                                                                                                       |
| `TextEncoder`, `TextDecoder`                                                                                                                                           | `TextEncoder`, `TextDecoder` (también se enlazan con `process`)                                                                               |
| `process`                                                                                                                                                              | `process`                                                                                                                                     |
| Temporizadores, el bucle de eventos, `queueMicrotask` y `performance`                                                                                                  | `setTimeout`, `setInterval`, `setImmediate`, `clearTimeout`, `clearInterval`, `clearImmediate`, `queueMicrotask`, `performance`, `globalThis` |
| `.at()`, `findLast`, `findLastIndex`, `Object.hasOwn`, `Object.groupBy`, `Map.groupBy`, `AggregateError`, `Promise.any`, `toSorted`, `toReversed`, `toSpliced`, `with` | `at`, `findLast`, `findLastIndex`, `hasOwn`, `groupBy`, `AggregateError`, `any`, `unscopables`                                                |
| `escape`, `unescape`, `substr`, `setYear`, `toGMTString`, `RegExp.prototype.compile` del Annex B y los métodos HTML de las cadenas (`anchor`, `big`, `link`, …)        | los mismos nombres                                                                                                                            |
| `Array.prototype.sort` estable por mezcla                                                                                                                              | `sort`                                                                                                                                        |
| Intl (solo en/en-US, [docs/intl.md](https://github.com/40oleg/nona/blob/main/docs/intl.md))                                                                            | `Intl`, `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, `localeCompare`                                                         |
| `Object.freeze`, `seal`, `isFrozen`, `isSealed` mediante trampas de Proxy (si no, versiones nativas para objetos ordinarios)                                           | los mismos nombres                                                                                                                            |
| `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`                                                                                         | los mismos nombres                                                                                                                            |
| Métodos de datos binarios de `ArrayBuffer`, `SharedArrayBuffer`, `DataView` y los arrays tipados (`slice`, `subarray`, `sort`, …)                                      | los nombres de sus constructores, `Atomics`, `TypedArray` (también con `process`, `Buffer` y `TextEncoder`)                                   |
| Métodos del protocolo RegExp y String (`Symbol.replace`, `String.prototype.match`, `matchAll`, `search`, `replaceAll`, …)                                              | con el motor de RegExp, o `replaceAll`                                                                                                        |

Un programa que llama a `Object.getOwnPropertyNames`, `Object.getOwnPropertyDescriptors` o `Reflect.ownKeys` enlaza todas, ya que podría enumerar los objetos integrados ([#84](https://github.com/40oleg/nona/issues/84)). Un hello world ocupa unos 1,1 MB; con todas las partes, 7 MB.

Los helpers que solo necesita cierta sintaxis se enlazan cuando el programa compilado los llama, no por nombre: sentencias `with`, `eval` literal, campos de clase y nombres privados, y módulos ES con `import()` e `import.meta` ([#278](https://github.com/40oleg/nona/issues/278)).

Un programa aún puede alcanzar una parte omitida mediante un nombre calculado en tiempo de ejecución, por ejemplo `globalThis['Reg' + 'Exp']`. Para el motor de RegExp y las tablas Unicode, esa llamada lanza un `Error` cuyo mensaje nombra la parte que falta; una global o un método omitido simplemente no existe. Compila con `--full-runtime` (o la opción `fullRuntime` de [`compile()`](/es/reference/api)) para enlazarlo todo ([#62](https://github.com/40oleg/nona/issues/62)). Con `--link parte,...` se añaden partes sueltas, y `--print-link` muestra qué se enlazó y qué nombre seleccionó cada parte ([#182](https://github.com/40oleg/nona/issues/182)).

## Realms

`$262.createRealm` está soportado para Test262. Las funciones, clases y código eval creados con código fuente literal mediante `Function`, `eval` o los constructores de funciones dinámicas de otro realm se ejecutan en ese realm, y los prototipos por defecto y los errores de los constructores provienen del realm que indica ECMA-262 ([#7](https://github.com/40oleg/nona/issues/7), [#176](https://github.com/40oleg/nona/issues/176)).

## Plataformas

- `process` y `node:fs` están disponibles en los ocho destinos; HTTP y TCP (`node:http`, `node:net`) en Windows y Linux.
- Los ejecutables de Windows usan DLL del sistema (incluida NTDLL para los metadatos del proceso padre) y las importaciones FFI declaradas; los ejecutables POSIX usan servicios nativos del sistema operativo.
- FFI llama a DLL en Windows y a bibliotecas compartidas (`.so`, `.dylib`) en Linux y macOS, con declaraciones portables por sistema operativo; los destinos BSD solo tienen llamadas directas al sistema. Las llamadas directas al sistema usan los números de kernel del destino Linux, Darwin o BSD elegido. Detalles: [Plataformas nativas](/reference/native-platforms).

## Buffer

Las globales `Buffer`, `Blob` y `File`, y las importaciones `node:buffer` / `buffer` / `nona:buffer`, están disponibles en todos los destinos nativos. Buffer admite codificaciones de bytes estándar, segmentos compartidos, copia, búsqueda y acceso numérico. Blob/File admiten datos inmutables y metadatos. Hay streams de bytes y de texto de Blob y registro y resolución de URL de objeto; consulta [el contrato de la API y sus limitaciones](/reference/host-apis#buffer-and-binary-data).
