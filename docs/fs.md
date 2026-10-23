# File system (`nona:fs`, `node:fs`)

A synchronous subset of the Node.js `fs` module is built in, with callback
and promise forms of the common functions on top of it. Both specifiers
resolve to the same implementation; `import fs from 'node:fs'`, named imports
and `require('fs')` work.

| Function                                                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readFileSync(path, options?)`                                            | Without an encoding returns a `Uint8Array` (Node.js returns a `Buffer`); `'utf8'` returns a string.                                                                                                                                                                                                                                                                                                                                 |
| `writeFileSync(path, data, options?)`                                     | `data`: string (UTF-8), typed array, DataView or ArrayBuffer. Flags: `w` replaces, `a` appends, `wx` creates exclusively. `mode` controls new POSIX file permissions.                                                                                                                                                                                                                                                               |
| `appendFileSync(path, data)`                                              |                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `existsSync(path)`                                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `accessSync(path, mode?)`                                                 | Throws `ENOENT` when the path does not exist; permission bits are not checked.                                                                                                                                                                                                                                                                                                                                                      |
| `statSync(path, options?)`                                                | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `isBlockDevice()`, `isCharacterDevice()`, `isFIFO()`, `isSocket()`, `dev`, `mode`, `nlink`, `uid`, `gid`, `rdev`, `blksize`, `ino`, `size`, `blocks`, `atimeMs`, `mtimeMs`, `ctimeMs`, `birthtimeMs`, `atime`, `mtime`, `ctime`, `birthtime` (see below); `{throwIfNoEntry: false}`. `{bigint: true}` preserves exact `dev`/`ino` identities; other numeric fields remain numbers. |
| `lstatSync(path, options?)`                                               | Like `statSync` for the link itself, not its target; `{throwIfNoEntry: false}`. On Windows, symbolic links and junctions are links.                                                                                                                                                                                                                                                                                                 |
| `readlinkSync(path)`                                                      | Target of a symbolic link (or Windows junction) as stored; `EINVAL` for other files.                                                                                                                                                                                                                                                                                                                                                |
| `realpathSync(path)`, `realpathSync.native(path)`                         | Canonical absolute path after resolving symbolic links.                                                                                                                                                                                                                                                                                                                                                                             |
| `readdirSync(path, options?)`                                             | Names without `.` and `..`, in file system order. `{withFileTypes: true}` returns `fs.Dirent` objects with `name`, `parentPath`, `path` and the `is*()` methods of `Stats`. `{recursive: true}` also lists all descendants as relative names joined with the platform separator (`sub/deep/c`), a directory before its entries, without following symbolic links to directories; `parentPath` is then the containing directory.     |
| `mkdirSync(path, {recursive}?)`                                           | With `recursive`, returns the first directory created.                                                                                                                                                                                                                                                                                                                                                                              |
| `rmSync(path, {recursive, force}?)`                                       | Removes a file, or a directory tree with `recursive`; `force` ignores a missing path.                                                                                                                                                                                                                                                                                                                                               |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` is supported.                                                                                                                                                                                                                                                                                                                                                                                             |

Callback functions have the same names without `Sync`: `readFile`, `writeFile`,
`appendFile`, `stat`, `realpath`, `readdir`, `mkdir`, `rmdir`, `unlink`,
`rename`, `copyFile` and `exists` (deprecated in Node.js: the callback receives
only a boolean). Each runs the synchronous function and calls back on a later
turn of the event loop with `(error, result)`; a wrong argument type (including
a missing callback) throws synchronously, as in Node.js. `fs.promises` is not
provided.

Paths are strings (or UTF-8 `Uint8Array`s). Only the `utf8` encoding is
supported. Errors are `Error` objects with Node.js codes (`ENOENT`, `EEXIST`,
`EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` and `path`,
and the same message format as Node.js (on Windows, Node.js shows the absolute
path in messages; Nona shows the path as given).

Implementation: on Windows the module calls KERNEL32 (`CreateFileW`,
`ReadFile`, `FindFirstFileW`, …) through [`nona:ffi`](ffi.md); on Linux, Darwin,
FreeBSD and OpenBSD it uses raw system calls declared with
`define('syscall', number, signature)`. All eight native targets have adapters. Only the
functions of the platform being compiled for are linked in.

The independently authored BSD/Darwin adapters use the operating systems'
documented syscall numbers and 64-bit stat/directory-entry layouts:
[FreeBSD ABI](https://github.com/freebsd/freebsd-src/tree/releng/14.3/sys/sys),
[OpenBSD ABI](https://github.com/openbsd/src/tree/master/sys/sys), and
[Darwin ABI](https://github.com/apple-oss-distributions/xnu/tree/main/bsd/sys).
Windows canonical paths can expand DOS short names; compare exact `dev`/`ino`
identities when deciding whether paths refer to the same file.

## Stats fields

- Linux, macOS and BSD read every field from the kernel `struct stat`. Linux has no birth time without `statx`, so `birthtime` equals `ctime` there (Node.js reports the real one where `statx` is available).
- Windows reads times from `GetFileInformationByHandle`: `birthtime` is the creation time, `atime` the last access, and `ctime` is the last write time (Node.js uses ChangeTime). `uid`, `gid` and `rdev` are 0, `blksize` is 4096 and `blocks` is `ceil(size / 512)`, as in Node.js.
- Times are milliseconds since the epoch with the nanosecond part as a fraction (`sec * 1000 + nsec / 1e6`).

## Callbacks and promises

`readFile`, `writeFile`, `appendFile`, `access`, `stat`, `lstat`, `readlink`,
`realpath` (with `realpath.native`), `readdir`, `mkdir`, `rm`, `rmdir`,
`unlink`, `rename`, `copyFile` and `exists` take a Node.js callback
(`(error, result)`; `exists` passes only a boolean). The same functions without
`exists` return promises from `fs.promises` and from the `node:fs/promises`
module (`fs/promises`, `nona:fs/promises`), which is the same object as
`fs.promises`. Both forms run the synchronous operation when called and only
defer the callback to a later tick or settle the promise: they do not overlap
file system work with other code.

## TextEncoder and TextDecoder

`TextEncoder` and `TextDecoder` are global and implement UTF-8 as specified
by the WHATWG Encoding standard: `encode(string)`, `decode(bufferSource)`,
the `fatal` and `ignoreBOM` options, U+FFFD replacement of invalid sequences
and lone surrogates. Other encodings throw `RangeError`.

## Executable size

`node:fs` is large, but a program that imports only some of its functions by name (`import { existsSync } from "node:fs"`) links only the code those functions reach: the other operations, `node:path` and the runtime parts they would select (the RegExp engine, timers, ...) are removed before linking. A namespace or default import, `import("node:fs")`, `require` and `process.getBuiltinModule` keep the whole module. `existsSync` alone builds to 1,808,896 bytes on win32-x64 instead of 5,017,088; see [builtin-module-pruning.md](builtin-module-pruning.md) for the design, the retained map and the limits ([#440](https://github.com/40oleg/nona/issues/440)).
