# node:fs and node:path dependencies

[#439](https://github.com/40oleg/nona/issues/439). How the filesystem
module reaches path code, which optional runtime parts that selected, and
what the split into `nona:internal/path-core` changed. Runtime parts are
selected lexically (see [runtime-linking.md](runtime-linking.md)): a part is
linked when a name that selects it appears in any source the program
compiles, built-in modules included.

## Before

```
node:fs  (fs-win32.js | fs-linux.js + fs-common.js)
 ├─ nona:ffi
 └─ node:path  (pathHost adapter + path-glob-original.js + path-original.js)
     ├─ nona:ffi                  pathHost: cwd and drive directories
     ├─ path-glob-original.js     matchesGlob: RegExp literals and "\p{L}" … strings
     │                            → regexp, regexpProtocol, unicodeProperties
     └─ path-original.js          the public API, including normalize
                                  → unicodeNormalization
```

`fs-common.js` imported `resolve`, `join` and `dirname` from `node:path`, so
every fs program compiled the whole public path module with its glob matcher.
The fs sources themselves added `annexB`: the platform layers tagged symbolic
links with the internal kind string `"link"`, which is also the name of
Annex B's `String.prototype.link`.

## After

```
node:fs
 ├─ nona:ffi
 └─ nona:internal/path-core  (pathHost adapter + path-core.js)
     └─ nona:ffi
node:path  (path-glob-original.js + path-original.js)
 └─ nona:internal/path-core  the same module instance
```

- `src/lib/modules/path-core.js` holds the argument checks, root, drive and
  UNC parsing, segment reduction, and `resolve`, `join`, `dirname` and the
  segment collapse behind `normalize` for both flavors. It names no RegExp,
  no `\p{…}`, no normalization or Annex B method and no `process`;
  `tests/path-core-source.test.ts` lexes it (and node:fs) for every target.
- `node:path` imports the core and builds its public flavors on it:
  `path.resolve`, `path.join` and `path.dirname` are the core's functions,
  `path.normalize` calls its collapse. Glob matching stays in `node:path`.
  Exports, `path.posix`/`path.win32`, the `path/posix` and `path/win32`
  modules, `_makeLong` and the `nona:`/`node:`/bare aliases are unchanged.
- A program that imports both modules links the core once.
- fs tags symbolic links `"symlink"` internally; `Stats` and `Dirent`
  behave as before.
- `nona:internal/*` modules are built-ins without registry names, so their
  sources skip the `process.getBuiltinModule` scan like the public
  built-ins (the pathHost adapter reads `globalThis`' `process` descriptor,
  which the scan would treat as an escape and link every built-in).

## Sizes

Nona 0.21.0, before: commit `16371594` (main), after: this change. Node.js
22.23.2 runs the compiler; default flags (`nona build probe.mjs -o out
--target <target> --print-link`), Windows 11 host. Probes:

| Probe   | Source                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------- |
| `hello` | `console.log("hello");`                                                                             |
| `exists`| `import { existsSync } from "node:fs"; console.log(existsSync("."));`                               |
| `rw`    | `import { readFileSync, writeFileSync } from "node:fs"; writeFileSync("probe.txt", "data"); console.log(readFileSync("probe.txt", "utf8"));` |
| `glob`  | `import path from "node:path"; console.log(path.matchesGlob("a/b", "a/*"));`                        |

File sizes in bytes:

| Probe    | PE before | PE after  | PE change  | ELF before | ELF after | ELF change |
| -------- | --------: | --------: | ---------: | ---------: | --------: | ---------: |
| `hello`  | 1,296,384 | 1,296,384 |          0 |  1,269,760 | 1,269,760 |          0 |
| `exists` | 5,016,576 | 2,340,864 | −2,675,712 |  4,919,296 | 2,256,896 | −2,662,400 |
| `rw`     | 5,019,648 | 2,342,912 | −2,676,736 |  4,927,488 | 2,265,088 | −2,662,400 |
| `glob`   | 4,572,672 | 4,586,496 |    +13,824 |  4,587,520 | 4,599,808 |    +12,288 |

`--print-link` (the same on both targets):

| Probe            | Linked runtime parts                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `hello`          | `moduleRecords`                                                                                            |
| `exists`, before | `regexp`, `unicodeProperties`, `unicodeNormalization`, `regexpProtocol`, `binaryData`, `encoding`, `timers`, `annexB`, `moduleRecords` |
| `exists`, after  | `binaryData`, `encoding`, `timers`, `moduleRecords`                                                        |
| `rw`             | as `exists`                                                                                                |
| `glob`           | `regexp`, `unicodeProperties`, `unicodeNormalization`, `regexpProtocol`, `binaryData`, `timers`, `moduleRecords` (unchanged) |

### Attribution

`hello` built with `--link` adds each group of parts without any module
code:

| `hello --link …`                                                     | PE        | ELF       |
| -------------------------------------------------------------------- | --------: | --------: |
| `binaryData,encoding,timers`                                         | 1,862,656 | 1,830,912 |
| … `,regexp,unicodeProperties,unicodeNormalization,regexpProtocol`    | 4,209,664 | 4,169,728 |
| … `,annexB`                                                          | 4,270,592 | 4,231,168 |

So of the PE saving of 2.68 MB, about 2.35 MB were the RegExp engine, its
Unicode property tables and the normalization tables, 61 KB Annex B, and the
remaining 268 KB the compiled code of the public path module and the glob
matcher (module code: 746 KB before, 478 KB after, for fs, its platform
layer, the path core and nona:ffi). ELF: 2.34 MB, 61 KB and 262 KB.

The `glob` probe grows by 12–14 KB: the core is now a module of its own,
with its record, export bindings and the host-flavor `resolve`/`join`/
`dirname` exports, and `normalize` is a wrapper of the core's collapse.

## What stays linked

- `binaryData`: the platform layers pass `Uint8Array`/`Uint16Array`
  buffers to system calls and Win32 functions.
- `encoding`: `TextEncoder`/`TextDecoder` convert paths and file contents
  between strings and UTF-8.
- `timers`: the callback API (`fs.readFile(…, cb)`) calls back with
  `setImmediate`, and the pathHost adapter names `globalThis`. A program that
  only calls the synchronous functions still links it, because selection is
  lexical over the whole module.
- `moduleRecords`: every module program.

Programs that use `node:path` themselves link what the public module needs,
as before: `normalize` selects `unicodeNormalization`, and `matchesGlob`'s
implementation selects `regexp` and `unicodeProperties` even when the
program does not call it, until built-in exports can be pruned (see #438).
