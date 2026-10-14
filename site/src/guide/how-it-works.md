# How it works

## Pipeline

```text
JavaScript source (script or module graph)
      │
      ▼
 lexer → parser → early errors and scope binding → compile-time eval/Function
                                                         │
                                                         ▼
                                     IR lowering → x86-64/AArch64 generation
                                                         │
                                                         ▼
                       runtime (native code + JS preludes) → PE32+/ELF64/Mach-O64 linker
```

Everything runs inside the compiler process; there is no external assembler, linker or C compiler. The result is one file that contains the program's machine code and Nona's runtime.

## Frontend

[`src/frontend`](https://github.com/40oleg/nona/tree/main/src/frontend) turns source text into a bound program:

- `lexer.ts`, `parser.ts` and `ast.ts` produce the syntax tree; unsupported syntax is a compile error.
- `binder.ts` and `declarations.ts` apply early errors, resolve every identifier to a scope (global, module, function, block, `with` object) and decide which bindings live in closures.
- `modules.ts` loads the module graph: static imports, `import()` with literal specifiers, cycles and export resolution. `builtin-modules.ts` and `fs-module.ts` provide the `nona:*` and `node:*` modules.
- `eval-aot.ts` and `dynamic-functions.ts` compile `eval` and `Function` calls whose source text is known at compile time.

## Intermediate representation

[`src/ir`](https://github.com/40oleg/nona/tree/main/src/ir) lowers the bound program to a register-like IR of blocks, operations and terminators (`lower.ts`, `model.ts`) and computes liveness (`liveness.ts`) so that the garbage collector only sees live values at each safepoint.

Before code generation, each function's IR goes through passes that keep JavaScript semantics exactly: constant folding and propagation with removal of branches on known conditions, dead-zone check removal, copy forwarding and dead-code removal, Number type inference and direct calls to known functions ([architecture](https://github.com/40oleg/nona/blob/main/docs/architecture.md#ir-optimization)).

## Code generation

[`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) contains an x86-64 instruction encoder and assembler and the code generator, which turns IR operations into calls into the runtime and inline fast paths; [`src/backend/arm64`](https://github.com/40oleg/nona/tree/main/src/backend/arm64) does the same for AArch64. Generated code uses a shared logical calling convention; OS bridges marshal it to each native ABI.

## Runtime

Every executable contains the runtime from [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime):

- **Values** are 16-byte tagged pairs: undefined, null, booleans, binary64 numbers, UTF-16 strings, objects, symbols and BigInts.
- **Objects** made by literals and constructors share _shapes_ (hidden classes): their properties live in 16-byte slots that the shape describes, and inline caches in the generated code read and write them after one shape comparison. What a shape cannot describe (accessors, deletion, other attributes, symbol keys) turns the object into an ordered property list, which gets a hash index when it grows long.
- **Native code** for built-ins is emitted as x86-64 or AArch64 with a small builder (`RuntimeBuilder`).
- **JavaScript preludes** (`src/lib/runtime/*.js`) implement parts of the library in JavaScript and are compiled into every executable: the RegExp engine, Promise and async drivers, Proxy and Reflect helpers, timers and the event loop, `process`, `TextEncoder`/`TextDecoder` and Annex B built-ins.

### Vector instructions (SIMD)

The runtime's hot routines work on 16 bytes at a time with 128-bit vector instructions: SSE2 on x86-64 and NEON on ARM64. Every CPU of these architectures has them, so executables need no CPU check and run anywhere; AVX is not used ([#253](https://github.com/40oleg/nona/issues/253)).

- **Strings:** equality and ordering of two strings, `indexOf`, `includes`, `lastIndexOf`, `split` and `replaceAll` (a vector scan for the first unit of the pattern), and copies of code units.
- **Typed arrays:** `fill`, `copyWithin`, `slice`, `set`, `indexOf`, `lastIndexOf` and `includes` move or compare blocks of memory.
- **Arrays:** `shift` and `splice` move element slots 64 bytes per step ([#262](https://github.com/40oleg/nona/issues/262)).
- **RegExp:** a pattern whose matches can only start with one of up to eight code units skips to them with a vector scan before each match attempt ([#258](https://github.com/40oleg/nona/issues/258)).
- **Memory:** new heap blocks are zeroed with 16-byte stores.

Where the instructions of real programs go, and which routines vectors speed up, is measured in [`docs/simd.md`](https://github.com/40oleg/nona/blob/main/docs/simd.md).

### Garbage collector

The collector is precise and non-moving: mark-and-sweep over explicit roots (globals, live stack slots at safepoints, runtime root scopes). Coroutine stacks of generators and async functions (1 MiB each) count towards the collection threshold. On Linux, heap blocks come from size classes carved out of 1 MiB arenas. The internal memory contract is described in [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md) (Russian).

### Exceptions, coroutines and the event loop

- Exceptions unwind native frames with real unwind data; a stack overflow throws a catchable `RangeError`.
- Generators and async functions run on their own stacks and switch context on `yield` and `await`.
- After the top-level program the entry runs the event loop: it drains Promise jobs, waits for the next timer without using the CPU and exits when nothing is left ([details](/reference/host-apis)).

## Linking

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)): sections, the import table (KERNEL32 for the runtime, plus DLLs declared with FFI), base relocations, unwind data and resources (icon, manifest, version information).
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf), [`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux), [`src/backend/bsd`](https://github.com/40oleg/nona/tree/main/src/backend/bsd)): every KERNEL32 function the runtime uses has a system-call shim with the same calling convention, so the runtime code is shared between targets. Linux and the BSDs make kernel calls directly, without libc.
- **Mach-O64** ([`src/backend/macho`](https://github.com/40oleg/nona/tree/main/src/backend/macho), [`src/backend/darwin`](https://github.com/40oleg/nona/tree/main/src/backend/darwin)): Intel macOS executables also use direct kernel calls; Apple Silicon executables load the system's `libSystem.B.dylib` through dyld for startup and OS services.

The same runtime serves all eight targets; [Native platforms](/reference/native-platforms) lists what is verified where.

## Self-hosting

The compiler compiles itself. The released `nona` is a native executable built by Nona with no Node.js inside; on Windows and Linux x64 it rebuilds itself into a byte-identical second stage. The [bootstrap guide](https://github.com/40oleg/nona/blob/main/docs/self-hosting.md) describes the procedure and its checks.

## FFI

A `define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` call is resolved at compile time: the declaration becomes an entry in the PE import table and a native thunk that converts JavaScript values, follows the Win64 ABI and captures `GetLastError`. On Linux, `define('syscall', '1', …)` declares a raw system call. See [Native functions (FFI)](/reference/ffi).

## Repository layout

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/arm64  AArch64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux, bsd: system-call shims
src/backend/macho  Mach-O64 linker; src/backend/darwin: macOS services
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## Formal verification prototype

[Lean proofs](https://github.com/40oleg/nona/blob/main/docs/formal-verification.md) cover selected slot move rules and a modeled straight-line dead-move optimizer. Run `npm run check:proofs` with Lean/elan installed. The production compiler, CFG analysis and native runtime are outside the current formal guarantee.
