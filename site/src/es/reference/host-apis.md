# APIs del host

::: info Traducción
Esta página es una traducción de la página en inglés [Host APIs](/reference/host-apis), generada a partir de [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). La versión en inglés es la de referencia y puede ser más reciente.
:::

Los programas de Nona se ejecutan sin Node.js. Las APIs del host que se describen a continuación las implementan el runtime nativo y pequeños preludios de JavaScript compilados en cada ejecutable.

## Paths (`node:path`)

`node:path` / `path` implements Node.js 26 path utilities on all eight native targets.
Use `posix`, `win32`, or explicit flavor modules (`node:path/posix`,
`node:path/win32`, `path/posix`, `path/win32`). Functions: `normalize`, `join`,
`resolve`, `relative`, `parse`, `format`, `basename`, `dirname`, `extname`,
`isAbsolute`, `toNamespacedPath`, `matchesGlob`; properties: `sep`, `delimiter`.
The target selects the default flavor; resolution reads the executable's runtime
current directory. Working-directory information is read on demand; importing
Path does not initialize the full process object. [Full reference](https://github.com/40oleg/nona/blob/main/docs/path.md).

## Temporizadores y el bucle de eventos

Globales: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate(callback, ...args)`, `clearImmediate`, `queueMicrotask(callback)` y `performance.now()`.

- Tras el programa de nivel superior, el punto de entrada ejecuta un bucle de eventos: vacía la cola de tareas de Promise y luego, repetidamente, espera al vencimiento del temporizador más próximo, ejecuta su callback y vuelve a vaciar la cola de tareas. El proceso termina cuando no quedan temporizadores.
- Los temporizadores se ordenan por vencimiento y luego por orden de registro. El retardo sigue a Node.js: se convierte con `ToNumber`, y los valores `NaN`, menores que 1 o mayores que 2^31-1 pasan a ser 1.
- Los ids de temporizador son números (Node.js devuelve objetos `Timeout`). `clearTimeout` y `clearInterval` aceptan cualquier id; los ids desconocidos se ignoran.
- La espera usa `Sleep` en Windows y `nanosleep` en Linux, así que un programa inactivo no consume CPU. En Windows la resolución es el tick del temporizador del sistema (normalmente 15,6 ms).
- `performance.now()` usa el reloj monótono (`QueryPerformanceCounter`, `clock_gettime(CLOCK_MONOTONIC)`) y cuenta milisegundos desde el inicio del programa.
- Una excepción no capturada en el callback de un temporizador termina el proceso con código de salida 1, igual que una excepción no capturada en el programa de nivel superior.
- Los realms creados por el host de Test262 no instalan sus propios temporizadores.

## Programas de larga duración

- El recolector cuenta las pilas de corrutinas reservadas (1 MiB por cada función async o generador en ejecución, `rt.generatorStackBytes`) para su umbral, de modo que las corrutinas abandonadas, cuyas pilas solo libera el barrido, disparan recolecciones igual que la basura ordinaria.
- `tests/stability.test.ts` comprueba que diez veces más disparos de temporizador (con tareas de Promise y basura en cada tick) no aumentan el pico de memoria, que miles de corrutinas abandonadas se liberan y que un programa que espera un temporizador de dos segundos apenas consume CPU.
- Límites conocidos: el almacenamiento de propiedades, elementos y Map es lineal (#36), así que los programas con cientos de temporizadores vivos u objetos grandes se ralentizan; en Linux cada bloque del heap es un mapeo de memoria aparte (#37).

## Events

`node:events`, `events` and `nona:events` share one built-in module. The default
export is `EventEmitter`; listener ordering, once/prepend listeners, removal,
introspection, meta events, error monitoring and rejection capture are supported.
Promise `once` and async-iterator `on` include cleanup, close events, externally
supplied abort signals and emitter watermarks. Listener/max-listener helpers and
disposable `addAbortListener` subscriptions under `Symbol.dispose` are also available.
`Symbol.dispose` and `Symbol.asyncDispose` have the distinct symbol identities used by Node.js 26.

See the [English events reference](/reference/host-apis#events) for the
complete supported API and limitations.

## URL {#url}

Los globales `URL` y `URLSearchParams` (exportados también por `node:url`) siguen el [URL Standard](https://url.spec.whatwg.org/): esquemas especiales (`http`, `https`, `ws`, `wss`, `ftp`, `file`) con puertos predeterminados, barras invertidas y segmentos de punto, referencias relativas respecto a una base, otros esquemas con autoridad o con ruta opaca (`mailto:`, `data:`, `blob:`), los conjuntos estándar de codificación porcentual, números IPv4 en cualquier notación y direcciones IPv6. Todos los componentes se pueden leer y asignar; `searchParams` se mantiene sincronizado con `search`. Se proporcionan `URL.canParse` y `URL.parse`. Los hosts se pasan a minúsculas, pero no se convierten con IDNA: una URL con un host no ASCII lanza `ERR_INVALID_URL`. El analizador solo se enlaza en un programa cuando sus fuentes mencionan `URL` o `URLSearchParams`. Sus métodos y accesores se instalan en `URL.prototype` y `URLSearchParams.prototype` al crear el primer objeto URL o de parámetros de búsqueda (o al llamar a `URL.canParse`), lo que mantiene pequeño el heap de los programas que nunca analizan una URL.

## Módulos de apoyo de Node.js {#nodejs-support-modules}

Estos módulos existen sobre todo para los [paquetes npm](/reference/npm), que los cargan al arrancar. Cada uno está disponible como `node:<name>` y como `<name>`.

- `node:os`: `EOL`, `devNull`, `platform`, `arch`, `machine`, `type`, `endianness`, `homedir` (`HOME`, o `USERPROFILE` en Windows), `tmpdir` (`TMPDIR`/`TMP`/`TEMP`), `hostname` (`HOSTNAME`/`COMPUTERNAME` o `localhost`), `userInfo`, `uptime`, `freemem`, `totalmem` y `constants.signals`/`priority`. `release` y `version` son cadenas vacías, `cpus()` y `networkInterfaces()` están vacíos, `loadavg()` devuelve ceros y `availableParallelism()` devuelve 1.
- `node:tty`: `isatty(fd)` indica si la entrada estándar, la salida estándar o la salida de errores es un terminal; `ReadStream` y `WriteStream` son clases mínimas para la detección de funcionalidades.
- `node:util`: `format` y `formatWithOptions` (`%s %d %i %f %j %o %O %c %%`), `inspect` (con `inspect.custom`, `depth`, `breakLength`, `maxArrayLength`, `customInspect`), `inherits`, `promisify` (con `promisify.custom`), `callbackify`, `deprecate` (avisa una vez por código), `debuglog` (`NODE_DEBUG`), `isDeepStrictEqual`, `types`, `styleText`, `stripVTControlCharacters`, `TextEncoder`/`TextDecoder` y los predicados heredados `is*`. `inspect` se aproxima al formato de Node.js: se muestran objetos, arrays, Maps, Sets, arrays tipados, funciones, clases, errores, fechas, valores envueltos, getters y referencias circulares, pero los colores, `showHidden`, `sorted` y la agrupación en columnas de los arrays largos de Node.js no se reproducen exactamente. `node:util/types` es `util.types`.
- `node:url`: `URL`, `URLSearchParams`, `fileURLToPath`, `pathToFileURL` (letras de unidad y hosts UNC en Windows), `urlToHttpOptions`, `domainToASCII`/`domainToUnicode` (solo ASCII) y los heredados `parse`, `format` y `resolve`.
- `node:assert` y `node:assert/strict`: `ok`, `equal`, `notEqual`, `strictEqual`, `notStrictEqual`, `deepEqual`, `deepStrictEqual` y sus negaciones, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`, `doesNotMatch`, `ifError`, `fail` y `AssertionError` (`code` `ERR_ASSERTION`). Los mensajes de fallo son más cortos que los diffs de Node.js.
- `node:crypto`: `randomBytes`, `randomFill`/`randomFillSync`, `randomUUID` (versión 4), `randomInt`, `getRandomValues` y `webcrypto.getRandomValues` leen la fuente aleatoria del sistema operativo (`BCryptGenRandom` en Windows, `/dev/urandom` en los demás). También `createHash` (`md5`, `sha1`, `sha256`, `sha384`, `sha512`, con `update`, `digest` en cualquier codificación de Buffer y `copy`), `createHmac`, `hash`, `getHashes` y `timingSafeEqual`. No se proporcionan cifrados, claves, firmas, derivación de claves ni `crypto.subtle`, y no hay `crypto` global.
- `node:querystring`: `parse`/`decode`, `stringify`/`encode`, `escape`, `unescape`.
- `node:timers`: las funciones de temporizador globales. `node:timers/promises`: `setTimeout`, `setImmediate` (ambos con un `AbortSignal`), `setInterval` como iterador asíncrono y `scheduler.wait`/`yield`.
- `node:perf_hooks`: `performance`; `PerformanceObserver` y `monitorEventLoopDelay` no observan nada.
- `node:module`: `builtinModules` e `isBuiltin`. `createRequire` lanza `ERR_NONA_UNSUPPORTED`: los módulos se resuelven al compilar el programa.
- `node:worker_threads`: `isMainThread` es `true`, `parentPort` y `workerData` son `null`; `Worker` lanza `ERR_NONA_UNSUPPORTED`.
- `node:child_process`: `spawn`, `exec`, `execFile`, sus variantes síncronas y `ChildProcess` ejecutan otros programas en Windows y Linux (x64); `fork`, el IPC y los demás destinos lanzan `ERR_NONA_UNSUPPORTED`. Detalles en [Child processes](/reference/host-apis#child-processes).
