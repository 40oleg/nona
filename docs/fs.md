# File system (`nona:fs`, `node:fs`)

A synchronous subset of the Node.js `fs` module is built in. Both specifiers
resolve to the same implementation; `import fs from 'node:fs'` and named
imports work.

| Function | Notes |
| --- | --- |
| `readFileSync(path, options?)` | Without an encoding returns a `Uint8Array` (Node.js returns a `Buffer`); `'utf8'` returns a string. |
| `writeFileSync(path, data, options?)` | `data`: string (UTF-8), typed array, DataView or ArrayBuffer. `{flag: 'a'}` appends. |
| `appendFileSync(path, data)` | |
| `existsSync(path)` | |
| `statSync(path, options?)` | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `size`, `mtimeMs`, `mtime`, `mode`; `{throwIfNoEntry: false}`. |
| `readdirSync(path)` | Names without `.` and `..`, in file system order. `withFileTypes` is not supported. |
| `mkdirSync(path, {recursive}?)` | With `recursive`, returns the first directory created. |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` is supported. |

Paths are strings (or UTF-8 `Uint8Array`s). Only the `utf8` encoding is
supported. Errors are `Error` objects with Node.js codes (`ENOENT`, `EEXIST`,
`EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` and `path`,
and the same message format as Node.js (on Windows, Node.js shows the absolute
path in messages; Nona shows the path as given).

Implementation: on Windows the module calls KERNEL32 (`CreateFileW`,
`ReadFile`, `FindFirstFileW`, …) through [`nona:ffi`](ffi.md); on Linux it uses
raw system calls declared with `define('syscall', number, signature)`. Only the
functions of the platform being compiled for are linked in.

## TextEncoder and TextDecoder

`TextEncoder` and `TextDecoder` are global and implement UTF-8 as specified
by the WHATWG Encoding standard: `encode(string)`, `decode(bufferSource)`,
the `fatal` and `ignoreBOM` options, U+FFFD replacement of invalid sequences
and lone surrogates. Other encodings throw `RangeError`.
