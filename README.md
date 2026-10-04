# Nona

**Nona is an ahead-of-time compiler that turns JavaScript (ES2020, with documented exceptions) into standalone native executables for Windows, Linux, Intel macOS, FreeBSD and OpenBSD.**

[Documentation](https://40oleg.github.io/nona/) · [Русская версия](README.ru.md) · [Language support](docs/language-support.md) · [ES2020 status](docs/v0.17-v0.20-status.md) · [Performance](PERFORMANCE.md) · [Changelog](CHANGELOG.md)

Nona parses JavaScript, lowers it to its own intermediate representation, emits x86-64 or AArch64 machine code and links a PE32+ (Windows), ELF64 (Linux/BSD) or Mach-O64 (macOS) executable. The output does not embed Node.js, V8 or any interpreter and needs no C/C++ toolchain or LLVM: Windows executables import only `KERNEL32.dll` (plus DLLs you call through FFI), Linux, BSD and Intel macOS executables use direct kernel calls and no libc.

> **Status:** `v0.7.0`. The full pinned Test262 suite (ES2020 features) passes **17298/17337** language, **15491/15559** built-in, **268/268** Atomics and **996/1016** Annex B tests on Windows x64. Every remaining failure is classified in the [status report](docs/v0.17-v0.20-status.md): `eval` of source text computed at run time, other realms, and semantics newer than ES2020. Nona is experimental: it is not a drop-in replacement for Node.js and has not had a security audit.

## What you get

- **The ES2020 language.** Classes and `super`, generators, async functions and async generators, `for await`, destructuring, spread, optional chaining, `??`, BigInt, Symbols, iterators, proper tail calls, sloppy-mode `with`, and Annex B web-compatibility semantics.
- **ES modules.** Static `import`/`export`, cycles and live bindings, `import.meta`, and dynamic `import()` of modules known at compile time. `.mjs` inputs are compiled as modules.
- **The ES2020 standard library.** Object/Function/Array/String/Number/Math, Date, JSON, RegExp (named groups, lookbehind, `s` and `u` flags, Unicode property escapes), Map/Set/WeakMap/WeakSet, ArrayBuffer, DataView and all typed arrays, SharedArrayBuffer and Atomics (with worker agents), Proxy and Reflect, and Promise with a job queue.
- **`eval` and `Function` with source known at compile time.** A string literal, a concatenation of literals, or a variable only ever given such constants is compiled ahead of time with full direct and indirect `eval` semantics. Source computed at run time throws `EvalError`; this is the one deliberate exception.
- **A native runtime.** A precise non-moving mark-and-sweep garbage collector, UTF-16 strings, real exceptions, and a catchable `RangeError` on stack overflow.
- **Host APIs** for real programs:
  - an event loop with `setTimeout`/`setInterval`, `queueMicrotask` and `performance.now()` ([host APIs](docs/host-apis.md));
  - a global `process` (`argv`, `env`, `exit`, `exitCode`, `cwd`, `platform`, …) and `node:process` ([process](docs/process.md));
  - synchronous `node:fs`/`nona:fs`, plus `TextEncoder`/`TextDecoder` ([file system](docs/fs.md));
  - calls to any DLL export on Windows through `nona:ffi`, with ready-made `nona:win32` declarations ([FFI](docs/ffi.md)).
- **Windows executables.** GUI programs without a console (`--subsystem windows`), plus an icon, manifest and version information embedded as resources ([Windows executables](docs/windows-executables.md)).

## How it works

```text
JavaScript source (script or module graph)
      │
      ▼
 lexer → parser → early errors and scope binding → compile-time eval/Function
                                                         │
                                                         ▼
                                     IR lowering → x86-64/AArch64 code generation
                                                         │
                                                         ▼
                       runtime (native code + JS preludes) → PE32+ or ELF64 linker
```

The compiler is written in TypeScript and runs on Node.js. A generated executable contains your program's machine code and Nona's runtime: values, objects, the garbage collector, built-ins, the job queue and host APIs.

## Requirements

- To run the compiler: Node.js 26 or newer and npm.
- Targets: Windows/Linux x64 and ARM64, Intel macOS, FreeBSD/OpenBSD x64. The default follows the host OS and CPU; see [native platforms](docs/native-platforms.md) for verification and API limits.

## Build Nona

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

The compiler entry point is `dist/cli.js`.

## Compile a program

```js
// hello.js
function greet(name) {
  return `Hello, ${name}!`;
}

setTimeout(() => console.log(greet("from Nona")), 10);
```

```sh
node dist/cli.js build hello.js -o build/hello.exe                     # Windows
node dist/cli.js build hello.js -o build/hello --target linux-x64      # Linux
```

```text
nona build <input.js> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|freebsd-x64|openbsd-x64] [--module]
           [--full-runtime] [--call-stats] [--coverage dir]
           [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
           [--version-info version.json]
nona --help | --version
```

`.mjs` inputs (or `--module`) are compiled as ES modules, together with the modules they import. The RegExp engine, the Unicode tables and built-in libraries such as `Proxy`, timers or `process` are linked only when the program can reach them, so a hello world is about 2.2 MB instead of 7 MB; `--full-runtime` links everything ([details](https://40oleg.github.io/nona/guide/compatibility#linked-runtime-parts)). The `examples` directory has more programs, including a [matrix calculator](docs/matrix-calculator.md).

## Limitations

- `eval`, `Function`, `GeneratorFunction` and `AsyncFunction` need source text known at compile time. Computed strings throw `EvalError` ([contract](docs/es2020-contract.md)).
- Most language and library features added after ES2020 (`WeakRef`, top-level `await`, …) are not supported. Supported additions: class fields, private methods and static blocks (ES2022), numeric separators, logical assignment (`&&=`, `||=`, `??=`), `Promise.any`/`AggregateError`, `.at()`, `findLast`/`findLastIndex`, `Object.hasOwn`, `String.prototype.replaceAll` and Error `cause`.
- Node.js modules other than the built-in `fs` and `process` subsets, npm packages, and browser APIs are not available.
- Some default prototypes for constructors from another realm, Map/Set performance on very large collections, and the RegExp engine's speed are still open work.
- macOS ARM64 is not yet enabled. Optional process/filesystem APIs are unavailable on Darwin/BSD; see [native platforms](docs/native-platforms.md).

Unsupported syntax is rejected at compile time. The [language support matrix](docs/language-support.md) lists exact behaviour and test coverage.

## Roadmap

The full plan, based on a review of the V8 blog, is in [docs/roadmap.md](docs/roadmap.md). In short:

- **Targets:** Windows/Linux x64 and ARM64, Intel macOS and BSD x64 are implemented; Apple Silicon startup remains blocked by the system-library policy. Future targets include `wasm32-wasi` and `linux-riscv64`.
- **Quick wins:** inline number operators, per-block safepoints, RegExp cache and number formatting are done; seeded hashing, collector fixes, fast array iteration, cheaper `await` and small post-ES2020 features are in progress.
- **Medium:** RegExp bytecode with a linear-time fallback, linking only the preludes a program uses, native JSON, static type inference, direct calls, real-world benchmarks, coverage builds.
- **Foundation:** shapes with in-object slots, a startup snapshot in the executable, a page-based heap, an SSA IR with register allocation, a builtins DSL, native RegExp matchers.

## Development

```sh
npm run check      # build and run the unit suite
npm run compare    # compile the compatibility examples and compare with Node.js
```

The tests compile and run real PE and ELF executables, many of them under GC stress, and compare their output with Node.js. Pinned Test262 audits are run with `scripts/test262-audit.ps1` (Windows) and `scripts/test262-audit.sh` (Linux); see [Test262](docs/test262.md). Contribution rules for people and agents are in [AGENTS.md](AGENTS.md).

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux: system-call shims
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
```

## Security

Nona has not had a security audit. Do not compile untrusted source code, and do not treat generated executables as a sandbox: they run with the same permissions as any other native program, and FFI can call any DLL.

## License

[MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
