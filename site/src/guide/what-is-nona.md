# What is Nona

Nona is an ahead-of-time compiler for JavaScript. It reads a script or a graph of ES modules, checks it, lowers it to its own intermediate representation, generates x86-64 or AArch64 machine code and links PE32+, ELF64 or Mach-O64 output.

The compiler is written in TypeScript and runs on Node.js. The programs it produces do not: they contain no interpreter, no V8 and no bytecode. A Windows executable imports only `KERNEL32.dll` (plus the DLLs a program calls through [FFI](/reference/ffi)); a Linux executable makes system calls directly and does not use libc.

## What you get

- **The ES2020 language.** Classes and `super`, generators, async functions and async generators, `for await`, destructuring, spread, optional chaining, `??`, BigInt, Symbols, iterators, proper tail calls, sloppy-mode `with`, and Annex B web-compatibility semantics.
- **ES modules.** Static `import`/`export`, cycles and live bindings, `import.meta`, and dynamic `import()` of modules known at compile time. `.mjs` inputs are compiled as modules.
- **The ES2020 standard library.** Object, Function, Array, String, Number, Math, Date, JSON, RegExp (named groups, lookbehind, `s` and `u` flags, Unicode property escapes), Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView and all typed arrays, SharedArrayBuffer and Atomics, Proxy and Reflect, and Promise with a job queue.
- **`eval` and `Function` with source known at compile time.** A string literal, a concatenation of literals, or a variable only ever given such constants is compiled ahead of time with full direct and indirect `eval` semantics.
- **A native runtime.** A precise, non-moving mark-and-sweep garbage collector, UTF-16 strings, real exceptions and a catchable `RangeError` on stack overflow.
- **Host APIs** for real programs: an [event loop with timers](/reference/host-apis), a global [`process`](/reference/process), synchronous [`node:fs`](/reference/fs) with `TextEncoder`/`TextDecoder`, and [native function calls](/reference/ffi) with ready-made `nona:win32` declarations.
- **Fast startup and a small footprint.** A compiled hello world starts in about 2 ms, peaks at 11 MB of memory and is a 3 MB file (4–7 MB when it uses regular expressions): there is no runtime to boot and no JIT to warm up ([Performance](/guide/performance)).
- **Windows executables** without a console window, with an icon, a manifest and version information ([Windows executables](/reference/windows-executables)).

## What Nona is not

- **Not a replacement for Node.js.** There is no `require`, no npm packages and no Node.js API beyond the [`fs` and `process` subsets](/reference/modules). Browser APIs are not available either.
- **Not a full ES2020 implementation.** Nona implements ES2020 with documented exceptions; see [Language support](/guide/language-support) and [Compatibility and limitations](/guide/compatibility).
- **No run-time code generation.** `eval` and `Function` need source text known at compile time; strings computed at run time throw `EvalError`.
- **Not fast at computation yet.** Without a JIT, calls, property access and allocation run 20–100× slower than in V8, and `Map`/`Set`, `sort`, string building and long Promise chains are still super-linear in the data size ([Performance](/guide/performance)).
- **Platform limits.** See the native platform matrix below for CPU and host API availability.

## Security

Nona has not had a security audit. Do not compile untrusted source code, and do not treat generated executables as a sandbox: they run with the same permissions as any other native program, and FFI can call any DLL.

## Where to go next

- [Getting started](/guide/getting-started) — build the compiler and your first program.
- [How it works](/guide/how-it-works) — the pipeline, the runtime and the linkers.
- [Examples](/examples/) — from a hello world to a wallpaper changer.

## Native platforms

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Native platforms](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
