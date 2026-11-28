# Original WebAssembly fixtures

These tiny binary modules are MIT-licensed Nona test inputs, authored for #667.
They contain no upstream PostgreSQL/PGlite or Emscripten code. Their byte builders
are in [tests/helpers/wasm.ts](../../helpers/wasm.ts); the source test compares
every checked-in byte with the builder and Node's validator. No WAT compiler,
download, external engine or C toolchain is needed.

| File            | Purpose                                                     |
| --------------- | ----------------------------------------------------------- |
| `callback.wasm` | Emscripten-style import/re-export callback wrapper          |
| `memory.wasm`   | Imported memory, unaligned i64 access, data segment, growth |
| `indirect.wasm` | Imported table and signature-checked indirect call          |
| `control.wasm`  | Start, imported/defined globals, loop, if, custom section   |
| `bulk.wasm`     | Passive data, init/drop, overlapping copy, fill             |
| `access.wasm`   | Every scalar load/store width and signedness                |
| `table.wasm`    | Passive elements, table init/drop/copy/fill/grow, ref.func  |

[webassembly.test.ts](../../webassembly.test.ts) compares native executable output
with Node, with GC stress on the callback, memory and control cases. The larger
scalar edge matrix runs without GC stress to keep local execution bounded.
The [PGlite inventory](../pglite/AUDIT.md) separately records the pinned package's
requirements. These fixtures prove the execution substrate, not database boot.
