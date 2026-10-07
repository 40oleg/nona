# Nona

**Nona is an ahead-of-time compiler that turns JavaScript (ES2020, with documented exceptions) into small standalone native executables for Windows, Linux, macOS, FreeBSD and OpenBSD.**

[Documentation](https://40oleg.github.io/nona/) · [Playground](https://40oleg.github.io/nona/playground) · [Releases](https://github.com/40oleg/nona/releases) · [Русская версия](README.ru.md) · [Language support](docs/language-support.md) · [Performance](PERFORMANCE.md) · [Changelog](CHANGELOG.md) · [All docs](docs/README.md)

```sh
$ nona build hello.js -o hello
$ ./hello
Hello, from Nona!
```

The executable contains your program's machine code and Nona's runtime, and nothing else. It does not embed Node.js, V8 or an interpreter, and building it needs no C/C++ toolchain or LLVM.

> **Status:** `v0.10.0`, experimental. In the Test262 audit of v0.8.0 the pinned suite (ES2020 features and the supported later ones, such as ES2022 class elements) passes **22436/22492** language, **15868/15933** built-in, **268/268** Atomics and **996/1016** Annex B tests on Windows x64. Every remaining failure is classified on the [status page](https://40oleg.github.io/nona/guide/status). Nona is not a drop-in replacement for Node.js and has not had a security audit.

## Why Nona

- **Small and fast to start.** A hello world is about 2.2 MB, because the RegExp engine, Unicode tables and libraries such as `Proxy`, timers or `process` are linked only when the program can reach them. It starts in about 2 ms and peaks at about 11 MB of memory (Node.js: 28 ms and 45 MB; measured on v0.7.0, see [PERFORMANCE.md](PERFORMANCE.md#14-startup-executable-size-build-time-memory)).
- **No dependencies at run time.** Windows executables import only `KERNEL32.dll` (plus DLLs you call through FFI). Linux, BSD and Intel macOS executables make direct kernel calls without libc. Apple Silicon output uses the system dyld and libSystem.
- **Eight targets from any host.** Cross-compile with `--target`; one Linux binary per CPU runs on Mint, Ubuntu, Debian, Fedora and Alpine.
- **Self-hosting.** The compiler compiles itself. The released `nona` is a native executable built by Nona, with no Node.js inside. On Windows and Linux x64 it rebuilds itself into a byte-identical second stage ([bootstrap](docs/self-hosting.md)).
- **Real programs.** Besides the language and its standard library: `process`, `fs`, `path`, `Buffer`, events, streams, timers, HTTP servers and clients, TCP sockets and Windows FFI.

## Install

Download the build for your system from the [latest release](https://github.com/40oleg/nona/releases/latest), extract it and run `nona --help` (`./nona --help` on Linux, macOS and BSD). The archive contains the executable, the license and a version file; nothing else needs to be installed.

| OS | Release build | Target name | Output format |
| --- | --- | --- | --- |
| Windows x64 / ARM64 | `nona-win32-x64.zip`, `nona-win32-arm64.zip` | `win32-x64`, `win32-arm64` | PE32+ |
| Linux x64 / ARM64 | `nona-linux-x64.zip`, `nona-linux-arm64.zip` | `linux-x64`, `linux-arm64` | ELF64 |
| macOS Intel / Apple Silicon | `nona-darwin-x64.zip`, `nona-darwin-arm64.zip` | `darwin-x64`, `darwin-arm64` | Mach-O64 |
| FreeBSD / OpenBSD x64 | `nona-freebsd-x64.zip`, `nona-openbsd-x64.zip` | `freebsd-x64`, `openbsd-x64` | ELF64 |

On POSIX systems, run `chmod +x nona` if your archive tool drops the permission. The [browser playground](https://40oleg.github.io/nona/playground) compiles and downloads programs for all eight targets without installing anything.

To build from source instead, you need Node.js 26 or newer and npm:

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

## Quick start

```js
// hello.js
function greet(name) {
  return `Hello, ${name}!`;
}

setTimeout(() => console.log(greet("from Nona")), 10);
```

```sh
nona build hello.js -o hello.exe                        # for the host system
nona build hello.js -o hello --target linux-x64         # cross-compile for Linux
nona build hello.js -o hello --target darwin-arm64      # cross-compile for Apple Silicon
```

A small HTTP server:

```js
// server.mjs
import http from 'node:http';

http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ path: req.url, time: Date.now() }));
}).listen(8080, () => console.log('listening on http://localhost:8080'));
```

```sh
nona build server.mjs -o server
```

Command line:

```text
nona build <input.js> -o <output> [--target <target>] [--module]
           [--full-runtime] [--call-stats] [--coverage dir]
           [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
           [--version-info version.json]
nona --help | --version
```

`.mjs` inputs (or `--module`) are compiled as ES modules, together with the modules they import. `--full-runtime` links every runtime part instead of only the reachable ones. The [CLI reference](https://40oleg.github.io/nona/reference/cli) describes every option, and the `examples` directory has more programs, including a [matrix calculator](docs/matrix-calculator.md).

## What is supported

**Language: ES2020.** Classes and `super`, generators, async functions and async generators, `for await`, destructuring, spread, optional chaining, `??`, BigInt, Symbols, iterators, proper tail calls, sloppy-mode `with` and Annex B web-compatibility semantics. ES modules with cycles, live bindings, `import.meta` and dynamic `import()` of modules known at compile time. Later additions that are supported: class fields, private methods and static blocks (ES2022), numeric separators, logical assignment, `Promise.any`/`AggregateError`, `.at()`, `findLast`/`findLastIndex`, `Object.hasOwn`, `String.prototype.replaceAll` and Error `cause`.

**Standard library: ES2020.** Object, Function, Array, String, Number, Math, Date, JSON, RegExp (named groups, lookbehind, `s` and `u` flags, Unicode property escapes), Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView and all typed arrays, SharedArrayBuffer and Atomics (with worker agents), Proxy, Reflect, and Promise.

**`eval` and `Function`** work when their source text is known at compile time: a string literal, a concatenation of literals, or a variable only ever given such constants. That source is compiled ahead of time with full direct and indirect `eval` semantics. Source computed at run time throws `EvalError`; this is the one deliberate exception ([contract](docs/es2020-contract.md)).

**Node.js-compatible APIs.** These are written for Nona, not taken from Node.js, and cover the subsets described in the linked pages:

| Module or global | What it covers | Docs |
| --- | --- | --- |
| `process`, `node:process` | `argv`, `env`, `cwd`/`chdir`, `exit`, `nextTick`, standard I/O streams, `hrtime`, `cpuUsage`, `memoryUsage`, signals, `kill`, `abort`, `execve` (POSIX), `title`, credentials and groups, diagnostic reports, `getBuiltinModule`, `loadEnvFile`; all eight targets | [process](docs/process.md) |
| timers | `setTimeout`, `setInterval`, `setImmediate` and their `clear*`, `queueMicrotask`, `performance.now()` | [host APIs](docs/host-apis.md) |
| `node:events` | EventEmitter, EventTarget, `AbortController`/`AbortSignal`, asynchronous context helpers | [events](docs/host-apis.md#events) |
| `node:async_hooks` | `AsyncLocalStorage` and `AsyncResource`, carried through promises, timers and microtasks | [host APIs](docs/host-apis.md) |
| `node:stream` | Readable, Writable, Duplex, Transform, pipelines, backpressure, async iteration, Web stream adapters | [streams](docs/host-apis.md#streams) |
| `node:fs` | synchronous file and directory operations on all eight targets | [file system](docs/fs.md) |
| `node:path` | POSIX and Windows variants, parsing, resolution, glob matching | [paths](docs/path.md) |
| `Buffer`, `Blob`, `File`, `node:buffer` | byte storage, standard encodings, numeric access; `TextEncoder`/`TextDecoder` | [binary data](docs/host-apis.md#buffer-and-binary-data) |
| `node:http`, `node:net`, `node:string_decoder` | HTTP/1.1 servers, clients and keep-alive agents; TCP sockets and servers (Linux and Windows) | [networking](docs/network.md) |
| `nona:ffi`, `nona:win32` | calls to any DLL export on Windows | [FFI](docs/ffi.md) |

**Windows executables** can be GUI programs without a console (`--subsystem windows`) and can embed an icon, a manifest and version information ([Windows executables](docs/windows-executables.md)).

The [language support matrix](docs/language-support.md) lists exact behaviour and test coverage. Unsupported syntax is rejected at compile time.

## Performance

Nona wins where an executable without a runtime should: startup, size and memory. Inside the program, plain computation is still several times to tens of times slower than V8's JIT, and closing that gap is the main line of the [roadmap](docs/roadmap.md).

Nona's own HTTP server against Node.js on the same program ([bench/http](bench/http/server.mjs), Linux x64, measured for v0.9.0):

| Case | Node.js req/s | Nona req/s | Memory, Node.js / Nona |
| --- | --- | --- | --- |
| hello (keep-alive) | 71–72k | 61–70k | 80 / 16 MB |
| JSON response | 66–68k | 55–61k | 79 / 16 MB |
| new connection per request | 25–27k | 22–26k | 70 / 18 MB |
| 64 KiB response | 20–21k | **33–38k** | 91 / 16 MB |
| 16 KiB request body | 49–54k | 41k | 78 / 16 MB |

[PERFORMANCE.md](PERFORMANCE.md) has the full comparison with Node.js, Deno and Bun, the method and the known slow spots.

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
                       runtime (native code + JS preludes) → PE32+/ELF64/Mach-O64 linker
```

The compiler is written in TypeScript. It is developed and bootstrapped on Node.js, and the released compiler is that same code compiled by Nona. The runtime is written in an assembler DSL plus JavaScript preludes: values and objects with inline caches, a precise non-moving mark-and-sweep garbage collector with lazy sweeping, UTF-16 strings, exceptions with a catchable `RangeError` on stack overflow, the job queue, an event loop that waits on timers and sockets, and the host APIs.

## Limitations

- `eval`, `Function`, `GeneratorFunction` and `AsyncFunction` need source text known at compile time.
- Most features newer than ES2020 that are not listed above (`WeakRef`, top-level `await`, …) are not supported.
- Node.js modules outside the table above, npm packages that need them, and browser APIs are not available. Networking runs on Linux and Windows.
- Plain computation is much slower than in a JIT; some default prototypes for constructors from another realm are still open work.

## Development

```sh
npm run check            # build and run the unit suite
npm run check:programs   # compare 1,000 standalone programs with Node.js
npm run compare          # compile the compatibility examples and compare with Node.js
```

The tests compile and run real executables, many of them under GC stress (a collection at every allocation), and compare their output with Node.js. CI runs them on all eight targets, including FreeBSD and OpenBSD guests, and checks that the native compiler rebuilds itself. Test262 audits use `scripts/test262-audit.ps1` (Windows) and `scripts/test262-audit.sh` (Linux); see [Test262](docs/test262.md). The [program corpus](programs/README.md) holds 1,000 small applications with recorded results.

A [Lean proof prototype](docs/formal-verification.md) checks selected IR move rules and a modeled dead-move optimizer. Run `npm run check:proofs` with Lean/elan installed. This proves the specified pure IR fragment; the production compiler is not yet formally verified.

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function, built-in modules
src/ir             intermediate representation, lowering and liveness
src/backend        x86-64 and AArch64 code generation; PE32+, ELF64 and Mach-O64 linkers; OS adapters
src/runtime        native runtime and the JavaScript preludes emitted into executables
tests              unit, integration, native-execution and compatibility tests
programs           the 1,000-program corpus
examples           sample programs
```

Contribution rules for people and agents are in [AGENTS.md](AGENTS.md).

## Security

Nona has not had a security audit. Do not compile untrusted source code, and do not treat generated executables as a sandbox: they run with the same permissions as any other native program, and FFI can call any DLL.

## License

[MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).



I want this to be used someday in a mission to Mars.
