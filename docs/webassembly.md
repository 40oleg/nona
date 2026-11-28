# WebAssembly execution

Nona implements an original in-process scalar WebAssembly interpreter for #667.
Its decoder, validator, executor and JS embedding live in `src/lib/runtime/wasm-*.js`;
`src/runtime/wasm-source.ts` assembles the optional prelude. Nona compiles that
JavaScript into native code with the program. The executable needs no external
WASM engine, JavaScript interpreter, library, subprocess or C toolchain.

Naming `WebAssembly` links `webAssembly`, `binaryData` and `encoding` through
`src/link.ts` and `src/backend/x64/preludes.ts`. Computed names that lexical
linking cannot see require `--link webAssembly`. No extra native registration
or new platform import is needed: binary data, BigInt and traced function calls
already supply the required primitives.

## Supported API and instructions

- `Module(bytes)`, `Instance(module, imports)`, `validate`, `compile` and both
  `instantiate` forms. Compilation snapshots the exact ArrayBuffer/view range.
  Async methods return promises and reject decode/link/start errors. They execute
  compilation on the calling thread; there is no compilation worker.
- `Module.imports`, `Module.exports` and `Module.customSections`, including
  `dylink.0` payloads. Returned metadata and custom-section buffers are copies.
  Dynamic linking policy and resource loading belong to the caller.
- Unshared 32-bit `Memory` with 64-KiB pages, optional maximum and `grow`;
  `Table` with `anyfunc` or `externref`, `get`, `set`, `grow` and `length`;
  numeric/reference `Global` with mutability and `value`/`valueOf`.
- Binary version 1, function types including multiple results and block
  parameters, imports/exports, locals/globals, start, custom sections, active,
  passive and declarative element segments, active/passive data and data count.
- Scalar i32/i64/f32/f64 arithmetic, comparisons, signed/unsigned division,
  remainder, shifts, rotates and bit counts; float rounding, min/max, square
  root, copysign, conversions, reinterpretation, saturating truncation and integer
  sign extension. i64 uses BigInt throughout, with modulo-64 arithmetic;
  i64 never passes through Number except explicit WASM conversion instructions.
- Structured blocks, loops, if/else, branches, br_table, calls/indirect calls,
  select, drop, return, unreachable, scalar loads/stores, memory size/grow,
  memory init/drop/copy/fill, table init/drop/copy/fill/size/grow/get/set and
  ref.null/ref.func/ref.is_null.

The supported families cover the frozen [PGlite 0.3.14 inventory](../tests/fixtures/pglite/AUDIT.md).
The [offline PGlite adapter](pglite-offline.md) supplies the local boot resources
and scoped platform checks. Native persistent profiles remain a subsequent step.
Streaming/fetch APIs, shared WASM memory, memory64, multiple memories, SIMD,
atomics, tail calls, WASM GC, tags and WASM exception instructions are absent.
Unknown instructions, types and section encodings fail closed with CompileError.
Extended constant expressions and newer typed reference proposals are absent.
This is a supported subset, not a claim of complete WebAssembly conformance.

## Validation, imports and traps

The decoder checks bounded LEB encodings, UTF-8 names, section sizes/order,
indices, limits, initializers, control labels and typed operand stacks before
instantiation. Invalid binaries throw `WebAssembly.CompileError`; `validate`
returns false for those binaries. Invalid JS buffer arguments throw TypeError.
Imports resolve through the supplied JS namespaces, so caller getter exceptions
propagate. Wrong function signatures, global types/mutability, memory/table
limits and missing import values produce LinkError naming the import. A missing
namespace or invalid imports object produces TypeError.

Memory effective addresses use unsigned i32 plus the full offset, without
wrapping the addition. All scalar/bulk memory and table accesses check the entire
range before writing. Bounds failures, null/signature-mismatched indirect calls,
unreachable, division by zero, signed division overflow and invalid numeric
conversions throw RuntimeError. JS callback exceptions propagate unchanged,
including objects and numeric Emscripten longjmp signals. The interpreter limits
nested WASM calls, including reentry, to 512 and throws RuntimeError at the limit.
The decoder limits a function to one million parameters plus locals. Allocation
remains subject to Nona's buffer/heap and host resource limits.
Currently each backing uses ArrayBuffer's 2,147,483,647-byte limit: at most
32,767 whole pages can be allocated. Larger declared maxima are accepted, but
growth beyond that allocation limit fails without changing the memory.

## Ownership, lifetime and callbacks

The embedding establishes these guarantees for callers, Emscripten glue and
future asset/profile adapters:

- Module state owns a copied byte snapshot. Reusing/mutating the input cannot
  change validation, execution or custom sections. Decoded function instructions
  are cached on first execution and shared between instances; mutable globals,
  dropped segments and imported resources remain per instance.
  Numeric opcode signatures are private immutable metadata shared by validation
  and execution, avoiding per-instruction signature allocations during large
  workloads such as PostgreSQL initialization.
- An exported function or a function stored in a table strongly retains its
  instance and imports, including memory, tables and globals. WeakMaps brand
  public objects; the state/function cycles are collectible when unreachable.
  Re-exporting an imported WASM function preserves its identity.
- JS functions cannot be stored directly in an anyfunc table. An importing and
  re-exporting WASM module supplies a typed wrapper, including Emscripten's
  generated callback-module pattern. Indirect calls compare complete signatures.
- Each interpreter invocation has separate traced locals, operand/control stacks
  and callback arguments. Allocating or reentrant JS callbacks may grow memory,
  mutate imported globals/tables or throw without invalidating suspended frames.
  Memory access reloads the current backing/view after a callback. There are no
  new native routines retaining raw Values across allocation: existing binary
  data routines and the compiler's normal GC stack maps own that boundary.
- Successful unshared growth, including growth by zero, replaces `.buffer`,
  copies all previous bytes, zeroes new pages and detaches old views. Failure
  preserves the backing, views and contents. WASM `memory.grow` returns -1 on
  growth failure; JS `Memory.grow` throws RangeError. Exposed WASM buffers cannot
  be transferred/detached by `transfer`, `transferToFixedLength` or a
  structuredClone transfer list; growth alone uses the private detach primitive.

These guarantees concern a single JavaScript thread and the supported subset.
There is no cross-worker store sharing, concurrent mutation, native address API,
machine-code JIT or database throughput guarantee.

## Checks and references

[Original redistributable fixtures](../tests/fixtures/wasm/README.md) and
[native/Node tests](../tests/webassembly.test.ts) cover scalar edge values,
malformed binaries, invalid imports, control flow, growth, every load/store,
tables, callbacks, reentry, GC stress and traps. Source tests check malformed
encodings and optional linking independently of native code generation.

After `npm run build`, run the specific files sequentially:

```sh
node --test --test-concurrency=1 dist/tests/webassembly.test.js dist/tests/webassembly-source.test.js
```

The algorithms follow the supported portions of the
[WebAssembly core validation rules](https://www.w3.org/TR/wasm-core-2/valid/instructions.html)
and [JavaScript interface](https://www.w3.org/TR/wasm-js-api-2/).
Node supplies an independent execution oracle; no upstream implementation code
is embedded in Nona.
