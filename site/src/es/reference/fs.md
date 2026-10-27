# Sistema de archivos (`nona:fs`, `node:fs`)

::: info Traducción
Esta página es una traducción de la página en inglés [File system](/reference/fs), generada a partir de [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md). La versión en inglés es la de referencia y puede ser más reciente.
:::

Se incluye un subconjunto síncrono del módulo `fs` de Node.js, con formas de callback y de promesa de las funciones habituales por encima. Ambos especificadores se resuelven a la misma implementación; funcionan `import fs from 'node:fs'`, las importaciones con nombre y `require('fs')`.

| Función                                                                   | Notas                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readFileSync(path, options?)`                                            | Sin codificación devuelve un `Uint8Array` (Node.js devuelve un `Buffer`); con `'utf8'` devuelve una cadena.                                                                                                                                |
| `writeFileSync(path, data, options?)`                                     | `data`: cadena (UTF-8), typed array, DataView o ArrayBuffer. `{flag: 'a'}` añade al final. `flag`: `w` / `a` / `wx`; POSIX `mode`.                                                                                                         |
| `appendFileSync(path, data)`                                              |                                                                                                                                                                                                                                            |
| `existsSync(path)`                                                        |                                                                                                                                                                                                                                            |
| `accessSync(path, mode?)`                                                 | Lanza `ENOENT` si la ruta no existe; no se comprueban los bits de permisos.                                                                                                                                                                |
| `statSync(path, options?)`                                                | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `isBlockDevice()`, `isCharacterDevice()`, `isFIFO()`, `isSocket()`, `size`, `mtimeMs`, `mtime`, `mode`; `{throwIfNoEntry: false}`. `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `lstatSync(path, options?)`                                               | Como `statSync`, pero para el propio enlace y no para su destino; `{throwIfNoEntry: false}`. En Windows, los enlaces simbólicos y las uniones (junctions) son enlaces.                                                                     |
| `readlinkSync(path)`                                                      | Destino de un enlace simbólico (o unión de Windows) tal como está almacenado; `EINVAL` para otros archivos.                                                                                                                                |
| `realpathSync(path)`, `realpathSync.native(path)`                         | Ruta absoluta canónica con enlaces simbólicos resueltos.                                                                                                                                                                                   |
| `readdirSync(path, options?)`                                             | Nombres sin `.` ni `..`; `{withFileTypes: true}` devuelve objetos `fs.Dirent` con `name`, `parentPath`, `path` y los métodos `is*()` de `Stats`.                                                                                           |
| `mkdirSync(path, {recursive}?)`                                           | Con `recursive`, devuelve el primer directorio creado.                                                                                                                                                                                     |
| `rmSync(path, {recursive, force}?)`                                       | Elimina un archivo, o un árbol de directorios con `recursive`; `force` ignora una ruta inexistente.                                                                                                                                        |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` está soportado.                                                                                                                                                                                                  |

Las rutas son cadenas (o `Uint8Array` en UTF-8). Solo se admite la codificación `utf8`. Los errores son objetos `Error` con códigos de Node.js (`ENOENT`, `EEXIST`, `EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` y `path`, y con el mismo formato de mensaje que Node.js (en Windows, Node.js muestra la ruta absoluta en los mensajes; Nona muestra la ruta tal como se pasó).

Implementación: en Windows el módulo llama a KERNEL32 (`CreateFileW`, `ReadFile`, `FindFirstFileW`, …) mediante [`nona:ffi`](/es/reference/ffi); en Linux usa llamadas al sistema directas declaradas con `define('syscall', number, signature)`. Solo se enlazan las funciones de la plataforma para la que se compila.

## Callbacks y promesas

`readFile`, `writeFile`, `appendFile`, `access`, `stat`, `lstat`, `readlink`, `realpath` (con `realpath.native`), `readdir`, `mkdir`, `mkdtemp`, `rm`, `rmdir`, `unlink`, `rename`, `truncate`, `copyFile`, `symlink`, `chmod`, `utimes` y `exists` aceptan un callback al estilo de Node.js (`(error, result)`; `exists` pasa solo un booleano). Las mismas funciones sin `exists` devuelven promesas desde `fs.promises` y desde el módulo `node:fs/promises` (`fs/promises`, `nona:fs/promises`), que es el mismo objeto que `fs.promises`. Ambas formas ejecutan la operación síncrona al llamarse y solo aplazan el callback a un tick posterior o resuelven la promesa: no solapan el trabajo del sistema de archivos con otro código.

## TextEncoder y TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` y `TextDecoder` son globales e implementan UTF-8 según el estándar WHATWG Encoding: `encode(string)`, `decode(bufferSource)`, las opciones `fatal` e `ignoreBOM`, y el reemplazo por U+FFFD de secuencias no válidas y surrogates sueltos. Las demás codificaciones lanzan `RangeError`.

Disponible en Windows, Linux y macOS (x64 y ARM64), FreeBSD y OpenBSD (x64).
