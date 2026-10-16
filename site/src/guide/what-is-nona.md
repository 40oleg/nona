# What is Nona

Nona is an ahead-of-time compiler for JavaScript. It reads a script or a graph of ES modules, checks it, lowers it to its own intermediate representation, generates x86-64 or AArch64 machine code and links PE32+, ELF64 or Mach-O64 output.

The compiler is written in TypeScript. It runs on Node.js, or as the released native `nona` executable, which Nona built from the compiler's own source. The programs it produces need neither: they contain no interpreter, no V8 and no bytecode. A Windows executable imports only `KERNEL32.dll` (plus the DLLs a program calls through [FFI](/reference/ffi)); a Linux executable makes system calls directly and does not use libc.

## What you get

- **The ES2020 language.** Classes and `super`, generators, async functions and async generators, `for await`, destructuring, spread, optional chaining, `??`, BigInt, Symbols, iterators, proper tail calls, sloppy-mode `with`, and Annex B web-compatibility semantics.
- **ES modules.** Static `import`/`export`, cycles and live bindings, `import.meta`, and dynamic `import()` of modules known at compile time. `.mjs` inputs are compiled as modules.
- **The ES2020 standard library.** Object, Function, Array, String, Number, Math, Date, JSON, RegExp (named groups, lookbehind, `s` and `u` flags, Unicode property escapes), Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView and all typed arrays (with resizable buffers and length-tracking views), SharedArrayBuffer (with growable support) and Atomics, Proxy and Reflect, and Promise with a job queue.
- **`eval` and `Function` with source known at compile time.** A string literal, a concatenation of literals, or a variable only ever given such constants is compiled ahead of time with full direct and indirect `eval` semantics.
- **A native runtime.** A precise, non-moving mark-and-sweep garbage collector, UTF-16 strings, real exceptions and a catchable `RangeError` on stack overflow.
- **Node.js-style host APIs** for real programs: an [event loop with timers](/reference/host-apis), [`process`](/reference/process), [`node:fs`](/reference/fs), `path`, `Buffer`, streams, events, `URL`, [HTTP and TCP](/reference/network), and [native function calls](/reference/ffi) with ready-made `nona:win32` declarations. [Built-in modules](/reference/modules) lists them all.
- **Eight targets.** Windows, Linux and macOS on x64 and ARM64, FreeBSD and OpenBSD on x64, cross-compiled from any host ([Native platforms](/reference/native-platforms)).
- **npm packages.** Packages in `node_modules` are resolved at build time and compiled into the executable ([npm packages](/reference/npm)).
- **Fast startup and a small footprint.** A compiled hello world starts in about 2 ms, peaks at 11 MB of memory and is a file of about 2 MB (up to 7 MB when a program reaches every optional runtime part): there is no runtime to boot and no JIT to warm up ([Performance](/guide/performance)).
- **Windows executables** without a console window, with an icon, a manifest and version information ([Windows executables](/reference/windows-executables)).

## What Nona is not

- **Not a replacement for Node.js.** npm packages are compiled in when the program is built ([npm packages](/reference/npm)), but only the [Node.js APIs Nona implements](/reference/modules) are available, and packages that need others (`zlib`, `https`, `child_process`), `Intl` or native add-ons do not work. Browser APIs are not available either.
- **Not a full ES2020 implementation.** Nona implements ES2020 with documented exceptions; see [Language support](/guide/language-support) and [Compatibility and limitations](/guide/compatibility).
- **No run-time code generation.** `eval` and `Function` need source text known at compile time; strings computed at run time throw `EvalError`.
- **Not as fast as V8 at computation.** Without a JIT, calls, closures and allocation run several times to tens of times slower than in V8, and long Promise chains and RegExp matching are the slowest spots ([Performance](/guide/performance)).
- **Not identical on every platform.** Filesystem and networking APIs, FFI and some `process` features differ by target; see [Native platforms](/reference/native-platforms).

## Security

Nona has not had a security audit. Do not compile untrusted source code, and do not treat generated executables as a sandbox: they run with the same permissions as any other native program, and FFI can call any DLL.

## Where to go next

- [Getting started](/guide/getting-started) — install the compiler and build your first program.
- [How it works](/guide/how-it-works) — the pipeline, the runtime and the linkers.
- [Examples](/examples/) — from a hello world to a wallpaper changer.
- [Language support](/guide/language-support) and [Compatibility and limitations](/guide/compatibility) — what works and what does not.
- [Command line](/reference/cli) and [Built-in modules](/reference/modules) — the reference.
