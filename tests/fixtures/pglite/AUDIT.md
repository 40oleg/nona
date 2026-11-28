# Published PGlite 0.3.14 compatibility audit

This records inspected upstream requirements for [#667](https://github.com/40oleg/nona/issues/667),
not guarantees implemented by Nona. The package, resource hashes, source-map
hashes and tool versions are pinned in [provenance.json](provenance.json),
[resources.json](resources.json) and [package-lock.json](package-lock.json).
The [Node oracle](oracle.test.mjs) is the executable reference for the selected
workloads. Review this audit with later engine, loader and persistence changes.

## Evidence and resources

Inspection used the actual npm tarball, not a newer PGlite API. Its `dist/index.js`
contains bundled Emscripten glue; the separate `dist/pglite.js` is readable generated
glue for inspection, not an extra import made by the workload. Source maps expose
`src/pglite.ts`, `src/utils.ts`, filesystem implementations and the generated glue.
The issue's [historical utils.ts reference](https://github.com/electric-sql/pglite/blob/6b7d56e56429259fb0241ffa17d484af2bddf00a/packages/pglite/src/utils.ts)
agrees with the inspected `wasmModule`/`fsBundle` loading interface. The registry
does not supply `gitHead`; the reference commit is not a tarball attestation.

| Local resource                                                |       Size (bytes) | Role                                                                                                   |
| ------------------------------------------------------------- | -----------------: | ------------------------------------------------------------------------------------------------------ |
| `dist/pglite.wasm`                                            |          8,859,436 | Main PostgreSQL module; SHA256 `8140392c5f70c5aecb40f514db242fce4223cfdd5f37a2b101dbdc30208dc49d`      |
| `dist/pglite.data`                                            |          4,939,155 | Emscripten filesystem image; SHA256 `4703ec26f5710abb62db42acad229478b75c51ef7f3bb037286bb2bac139a930` |
| `dist/index.js` and five `dist/chunk-*.js` files              | pinned in manifest | Client, protocol, helpers and bundled glue                                                             |
| `dist/fs/nodefs.js`                                           |                536 | Dynamically imported disk-profile adapter                                                              |
| Package metadata, license, inspected maps and standalone glue | pinned in manifest | Resolution, redistribution and audit evidence                                                          |

There are 689 entries in the filesystem image: PostgreSQL catalogs, SQL/text-search
data, configuration, `/home/web_user/.pgpass`, placeholder executable paths, and
28 **WASM** shared libraries under `/tmp/pglite/lib/postgresql/`. These `.so` files
are not native ELF libraries. Their names, byte hashes, typed imports, dynamic
linking metadata and instruction inventories are in [audit.json](audit.json).
They include `dict_snowball`, `plpgsql`, `pgoutput`, `libpqwalreceiver` and encoding
conversions. They must be available from the local image even when no optional
extension is requested. The static audit includes dormant libraries too; it does
not claim every library is loaded by SELECT 1. Optional `dist/*.tar.gz` extensions,
browser workers, IndexedDB and OPFS are outside this fixture.

`PGlite.create({ wasmModule, fsBundle })` accepts a compiled `WebAssembly.Module`
and `Blob`/`File`. The client awaits `fsBundle.arrayBuffer()`, supplies its exact
contents through Emscripten's `getPreloadedPackage("pglite.data", expectedSize)`,
and checks the expected length. Its `instantiateWasm(imports, successCallback)`
returns `{}` while asynchronous instantiation completes, then calls
`successCallback(instance, module)`. It suppresses the default WASM download when
`wasmModule` is provided. The fixture reads and hashes both files from disk before
compiling; no streaming/fetch fallback is used. Passing bytes as `wasmBinary` or
using a newer release's resource option names is not this version's public path.

## Module and instruction requirements

The main binary has 228 function types, 11,426 defined functions, 1,646 defined
globals, 1,283 exports (1,204 functions and 79 globals), a start function, one
element segment and one data segment. Its 123 imports comprise 117 functions,
four globals, one memory and one table. WABT's complete import/type declarations
are in [audit.json](audit.json), so a subsequent implementation need not infer
signatures from names. Import namespaces are `env`, `wasi_snapshot_preview1` and
`GOT.mem`; side modules also use `GOT.func` and resolve PostgreSQL symbols from
the main module through Emscripten's dynamic linker.

The main inventory contains 158 distinct opcodes and 2,852,278 counted operators
(including initializers/element expressions). Across the image's side modules
there are 162 distinct opcodes. Required families include structured control
flow, `br_table`, indirect calls, globals/locals, all four scalar types, signed
and unsigned loads/division/remainder/shifts, integer bit counts/rotates,
floating arithmetic/comparison/rounding/square root, reinterpretation and
float/integer conversions. `ref.func` occurs in the element expressions.
Side modules add `i32.extend8_s`, `i32.extend16_s`, `memory.copy` and `memory.fill`:
an MVP-only opcode implementation is insufficient for the full shipped image.
There are no SIMD, atomics, tail-call, GC or native WASM exception instructions
in this frozen inventory. This says nothing about other releases or optional
extension archives.

The loader needs `WebAssembly.compile`, `instantiate` with a precompiled module,
`Module`/`Instance` constructors, `.exports`, `Module.customSections("dylink.0")`,
`Memory`, `Table`, `Global`, appropriate errors and JS/WASM scalar conversions.
`i64` crosses the JS boundary as BigInt, including clocks, offsets and callback
signatures. Compile/link errors must reject rather than leave the Emscripten
readiness promise pending. A generic WASI launcher is insufficient: Emscripten
provides filesystem/syscall functions, imported mutable globals, symbol lookup,
relocations, callbacks and longjmp behavior.

## Memory, table, relocation and callbacks

- Glue creates unshared 32-bit memory with 256 initial 64-KiB pages (16 MiB) and
  maximum 32,768 pages (2 GiB). It imports that same memory into the engine and
  side modules. The maximum is an address-space limit, not a fixture allocation
  or acceptance of 2 GiB resident usage. `emscripten_resize_heap` calls JS
  `Memory.grow`; every growth refreshes signed/unsigned integer, BigInt and float
  heap views over `.buffer`. The main binary uses `memory.size` but has no
  `memory.grow` instruction; supporting only opcode growth would miss the JS path.
- Glue creates a `funcref` table via legacy `element: "anyfunc"`, initially 5,609
  entries; the main import requires at least 5,608. It uses `get`, `set`, `grow`
  and `.length`, preserves function identity in a `WeakMap`, reserves null slots
  and reuses removed callback indices. Side-module element relocation and dynamic
  loading share/extend this table. Bounds checks, signatures and indirect-call
  traps matter.
- Initial imported `__memory_base` is immutable i32 1,024; `__table_base` is
  immutable i32 1; `__stack_pointer` is mutable i32 2,765,600. `GOT.mem.__heap_base`
  is mutable. The glue uses `Global.value`, parses `dylink.0`, relocates exported
  address globals, updates `GOT.mem`/`GOT.func` via proxies and applies data
  relocations and constructors in order. These addresses are upstream layout
  facts, not a recommended Nona ABI.
- The client registers two `addFunction(..., "iii")` protocol callbacks: each
  takes an i32 pointer and length, returns i32, and reads/writes the current WASM
  heap. `addFunction` first tries `Table.set` with the JS function; on `TypeError`
  it constructs a tiny importing/exporting WASM wrapper (or uses
  `WebAssembly.Function` if available). The wrapper uses module/instance
  constructors independently of the main module. SQL calls can re-enter JS and
  then return to WASM; a callback cannot be replaced by a fixed success result.
- Imported `invoke_*` trampolines cover i32, i64 and float signatures. They save
  the WASM stack, perform the indirect call, restore it on an exception, rethrow
  JS errors and translate numeric longjmp signals through `_setThrew`.
  `_emscripten_throw_longjmp` throws `Infinity`; i64 trampoline fallback values
  are BigInts. This is Emscripten JS exception handling, not WASM EH opcodes.
- Initialization honors run dependencies, pre-run filesystem hooks, relocations,
  constructors and runtime readiness. `emscripten_asm_const_int` invokes the
  generated `ASM_CONSTS` handlers, which configure protocol/message callbacks.
  Close sends protocol termination, calls `_pgl_shutdown`, removes both table
  callbacks and closes/quits the filesystem before reporting `db.closed`.

## Host and filesystem requirements

`env` imports include `__syscall_*` path/descriptor operations, `invoke_*`,
`_dlopen_js`/`_dlsym_js`, heap growth/memcpy, clock/date/timezone helpers,
longjmp/abort/exit, environment and timer helpers. The WASI namespace supplies
`environ_get`, `environ_sizes_get`, `clock_time_get`, `proc_exit` and descriptor
close/read/write/pread/pwrite/seek/stat/sync. Socket, DNS, signal and system-call
imports are present; static import presence does not authorize network access
or imply that SQL startup needs a network server. The oracle denies networking,
child processes and workers while these imports remain supplied by the glue.

The generated FS starts with MEMFS and creates directories/devices and preloaded
files. A plain Node `dataDir` dynamically selects `NodeFS`, resolves/creates its
root and mounts it at `/tmp/pglite/base`. Startup checks `PG_VERSION`, initializes
a missing database, writes catalog/WAL/configuration files and reuses them on
reopen. This is a single-owner profile; concurrent writers and crash recovery
are not established by the two-process clean-close oracle.

The generated NODEFS layer uses synchronous Node operations: `lstatSync`,
`chmodSync`, `utimesSync`, `truncateSync`, `mkdirSync`, `writeFileSync`,
`renameSync`, `unlinkSync`, `rmdirSync`, `readdirSync`, `symlinkSync`,
`readlinkSync`, `openSync`, `closeSync`, `readSync`, `writeSync`, `fstatSync`
and `statfsSync`. Descriptor flags, numeric positions, partial reads/writes,
directory enumeration, errno translation, stat fields and Windows permission
handling must agree with the glue. It also has mmap/msync emulation through heap
buffers. Merely supplying whole-file read/write helpers will not support the
profile path. NODEFS persistence is direct host I/O, unlike IDBFS sync callbacks.
The inspected `fdatasync` only validates the descriptor, and `fd_sync` delegates
only if the stream supplies `fsync`; NODEFS has no such stream method. A clean
close/reopen pass therefore does not establish power-loss durability.

COPY uses the client-created `/dev/blob` device, not host socket I/O: its
open/close/read/write/llseek callbacks transfer bytes between a Blob's array
buffer and WASM memory. Input is supplied as the query's `{ blob }` option;
output appears on the result as `.blob`. The fixture uses PostgreSQL binary COPY
framing and compares the entire exported stream plus each recovered `bytea`
byte. Text-only COPY and a nonzero payload length would not prove embedded-zero
or 0x80–0xff preservation. Browser storage, optional extensions, arbitrary SQL,
crash durability and native ELF execution remain later acceptance work.
