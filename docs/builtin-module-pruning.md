# Pruning of built-in modules

Design and evidence for [#440](https://github.com/40oleg/nona/issues/440). It extends the lexical runtime linking of [runtime-linking.md](runtime-linking.md): the lexer sees every identifier and string of the program, so the code of a built-in module such as `node:fs` used to select optional runtime parts (the RegExp engine, Unicode tables, timers, ...) even when the program used one function of it.

## Design

The built-in modules are JavaScript (`src/lib/modules/*.js`) compiled into the program. `src/frontend/builtin-pruning.ts` removes the top-level code of a built-in module that a program cannot reach, before the source usage is collected and before the runtime parts are chosen. The runtime parts are therefore selected from the kept code only.

1. **Units.** A built-in module record is split into units: an import specifier, a declarator, a function or class declaration, an export specifier, a member of a private object literal, a statement that only initializes a property of one declaration. Each unit has an edge to every top-level name it mentions, nested functions included.
2. **Demand.** It starts from the static named imports and re-exports of the modules that are kept whole (user modules and built-ins that cannot be analysed). A kept unit that imports a name of another built-in demands it, so the demand grows to a fixpoint over the whole graph (`node:fs` reaches `node:path`, the platform file system module and `nona:ffi`).
3. **Roots.** Besides the demanded exports, a unit is kept when evaluating it may have an effect. The purity rules are conservative: literals, functions, classes without static code, object and array literals of pure parts, reads of initialized bindings and standard globals, `nona:ffi` `define()` and calls of local functions that only build and return a new function or object are pure. Anything else stays and keeps what it mentions. The analysis assumes that the standard globals on its allow list have not been replaced with accessors before a built-in module evaluates.
4. **Usage from the kept code.** The lexical usage (`collectSourceUsage`) of a pruned built-in is that of its kept units. A pruned `fs` whose kept code does not name `RegExp` syntax, `setImmediate` or `TextEncoder` no longer selects `regexp`, `timers` or `encoding`.

Kept declarations are the very bindings every importer shares, so live bindings, cycles, initialization order and object identity are the same as without pruning. `NONA_NO_BUILTIN_PRUNING=1` in the environment of the compiler disables the pass (to measure it).

## Supported shapes

A built-in module is pruned when every request for it is one of:

- a static named import (`import { existsSync } from "node:fs"`, with or without `as`),
- a named re-export (`export { existsSync as check } from "node:fs"`), also through user modules and other built-in modules.

The requests of the whole module graph are unioned: the module keeps the units that any of them reaches.

## Conservative cases

A built-in module is kept whole when anything can observe it as an object:

- a namespace import (`import * as fs`) and `export * from`,
- a default import (the default export aggregates the module),
- `import("node:fs")` and any dynamic or computed specifier,
- `process.getBuiltinModule`, `require` and `createRequire` lookups,
- a script (non-module) request.

Other limits: a pruned module still carries its kept helpers and their native dependencies, and the shared fs/path/FFI machinery stays. The pass does not split a function body, so one rarely used branch inside a kept function still selects the runtime part it names (for example `writeFileSync` brings `annexB`). Splitting the module boundaries is the subject of [#439](https://github.com/40oleg/nona/issues/439) and the semantic runtime feature selection of [#438](https://github.com/40oleg/nona/issues/438).

## Evidence

Windows x64, `node bench/size-builtin.mjs` (fixtures in [`bench/size/`](../bench/size)), which runs `nona build <file> --target win32-x64 --print-link` with no other flags, Node.js 26. "Before" is the compiler at 16371594 (v0.21.0, the parent of the pruning change); "after" is c16a5741. Sizes are the exact bytes of the `.exe`.

| Fixture                                               | Before (16371594) | After (c16a5741) | Linked runtime parts after                  |
| ----------------------------------------------------- | ----------------: | ---------------: | ------------------------------------------- |
| `console.log("hello")`                                |         1,296,384 |        1,296,384 | moduleRecords                               |
| one named operation (`existsSync`)                    |         5,017,088 |        1,808,896 | binaryData, encoding, moduleRecords         |
| several (`readFileSync`, `writeFileSync`, `statSync`) |         5,021,184 |        1,946,112 | binaryData, encoding, annexB, moduleRecords |
| alias (`existsSync as exists`)                        |         5,017,088 |        1,808,896 | binaryData, encoding, moduleRecords         |
| re-export through a user module                       |         5,019,648 |        1,811,456 | binaryData, encoding, moduleRecords         |
| namespace import                                      |         5,017,088 |        5,006,848 | all nine (`fs` kept whole)                  |
| default import                                        |         5,017,088 |        5,006,848 | all nine (`fs` kept whole)                  |
| `import("node:fs")`                                   |         5,018,112 |        5,007,872 | all nine (`fs` kept whole)                  |

Before the change every fixture except `hello` linked `regexp`, `unicodeProperties`, `unicodeNormalization`, `regexpProtocol`, `binaryData`, `encoding`, `timers`, `annexB` and `moduleRecords`. The conservative cases are unchanged apart from about 10 KB that comes from other edits of the `fs` sources in the same change. With `NONA_NO_BUILTIN_PRUNING=1` the current compiler builds the `existsSync` fixture at 5,018,624 bytes, so the saving comes from the pass.

The probe of the issue (Nona 0.20.0: 4,503,552 bytes for `existsSync` against 1,202,688 for `hello`) corresponds to 5,017,088 against 1,296,384 on v0.21.0; the pruned build is 1,808,896 against 1,296,384. The remaining 512 KB are the real dependencies below. Linux x64 sizes come from the same script on a Linux host (`--targets win32-x64,linux-x64`); they were not measured for this record.

### Retained map for `import { existsSync } from "node:fs"`

| Layer             | Kept                                                                                                                                                                                             | Removed                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `node:fs` exports | `existsSync`                                                                                                                                                                                     | the other sync, callback and promise operations, `Stats`, `Dirent`, `promises`, `constants`, the default object (81 units) |
| fs helpers        | `codeOf`, `error`, `attributeData`, `attributeView`, `attributes`, `isDirectory`, `sys.stat`, `decoder`, `descriptions`, `fail`, `pathString`                                                    | `readChunks`, encodings, every other `sys` member                                                                          |
| initializers      | the constants `INVALID_HANDLE`, `DIRECTORY`, `BACKUP_SEMANTICS`, `OPEN_REPARSE_POINT` and the FFI imports `CreateFileW`, `GetFileInformationByHandle(Ex)`, `CloseHandle`, `GetFileAttributesExW` | every other FFI import and constant                                                                                        |
| `node:path`       | nothing                                                                                                                                                                                          | all 53 units                                                                                                               |
| runtime parts     | `binaryData` (`Uint8Array`), `encoding` (`TextDecoder` of `decoder`), `moduleRecords`                                                                                                            | `regexp`, `unicodeProperties`, `unicodeNormalization`, `regexpProtocol`, `timers`, `annexB`                                |

`collectBuiltinPruning` (used by `tests/builtin-pruning.test.ts`) returns the exact kept and removed sets for any program.

## Reproducing

```
npm run build
node bench/size-builtin.mjs                            # after
NONA_NO_BUILTIN_PRUNING=1 node bench/size-builtin.mjs  # pass disabled
node bench/size-builtin.mjs --cli <older checkout>/dist/cli.js
```

The script prints the compiler path, the target, the exact byte count and the linked parts of each fixture. On Linux it also builds `linux-x64`.
