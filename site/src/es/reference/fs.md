# Sistema de archivos (`nona:fs`, `node:fs`)

::: info Traducción
Esta página es una traducción de la página en inglés [File system](/reference/fs), generada a partir de [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md). La versión en inglés es la de referencia y puede ser más reciente.
:::

Se incluye un subconjunto síncrono del módulo `fs` de Node.js. Ambos especificadores se resuelven a la misma implementación; funcionan tanto `import fs from 'node:fs'` como las importaciones con nombre.

| Función | Notas |
| --- | --- |
| `readFileSync(path, options?)` | Sin codificación devuelve un `Uint8Array` (Node.js devuelve un `Buffer`); con `'utf8'` devuelve una cadena. |
| `writeFileSync(path, data, options?)` | `data`: cadena (UTF-8), typed array, DataView o ArrayBuffer. `{flag: 'a'}` añade al final. `flag`: `w` / `a` / `wx`; POSIX `mode`. |
| `appendFileSync(path, data)` | |
| `existsSync(path)` | |
| `statSync(path, options?)` | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `size`, `mtimeMs`, `mtime`, `mode`; `{throwIfNoEntry: false}`. `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `realpathSync(path)` | Ruta absoluta canónica con enlaces simbólicos resueltos. |
| `readdirSync(path, options?)` | Nombres sin `.` ni `..`; `{withFileTypes: true}` devuelve entradas con `name`, `isFile()`, `isDirectory()`, `isSymbolicLink()`. |
| `mkdirSync(path, {recursive}?)` | Con `recursive`, devuelve el primer directorio creado. |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` está soportado. |

Las rutas son cadenas (o `Uint8Array` en UTF-8). Solo se admite la codificación `utf8`. Los errores son objetos `Error` con códigos de Node.js (`ENOENT`, `EEXIST`, `EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` y `path`, y con el mismo formato de mensaje que Node.js (en Windows, Node.js muestra la ruta absoluta en los mensajes; Nona muestra la ruta tal como se pasó).

Implementación: en Windows el módulo llama a KERNEL32 (`CreateFileW`, `ReadFile`, `FindFirstFileW`, …) mediante [`nona:ffi`](/es/reference/ffi); en Linux usa llamadas al sistema directas declaradas con `define('syscall', number, signature)`. Solo se enlazan las funciones de la plataforma para la que se compila.

## TextEncoder y TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` y `TextDecoder` son globales e implementan UTF-8 según el estándar WHATWG Encoding: `encode(string)`, `decode(bufferSource)`, las opciones `fatal` e `ignoreBOM`, y el reemplazo por U+FFFD de secuencias no válidas y surrogates sueltos. Las demás codificaciones lanzan `RangeError`.
