# Changelog

## Unreleased

- The collector marks strings and other reference-free blocks without queueing them for tracing, and in GC stress mode fills freed cells with a poison pattern so a missing root fails at once instead of when the cell is reused ([#67](https://github.com/40oleg/nona/issues/67)).
- Added the [roadmap](docs/roadmap.md) from a review of the V8 blog, with the planned target architectures ([#64](https://github.com/40oleg/nona/issues/64)).
- Made spread, array destructuring and array rest step built-in array iterators directly and append elements to the dense element store: `[...a]` and `const [x, ...rest] = a` are 5–8 times faster ([#65](https://github.com/40oleg/nona/issues/65)).
- Added the documentation site on GitHub Pages: https://40oleg.github.io/nona/ ([#49](https://github.com/40oleg/nona/issues/49)).
- Seeded the string and number hashes of the property index and of Map, Set, WeakMap and WeakSet per process, so colliding keys cannot be prepared in advance (hash flooding) ([#66](https://github.com/40oleg/nona/issues/66)).
- Published the performance comparison with Node.js, Deno and Bun on the documentation site, with startup time, executable size and memory on the home page ([#55](https://github.com/40oleg/nona/issues/55)).
- Added a playground to the documentation site: the compiler runs in the browser and produces a Windows or Linux executable to download ([#56](https://github.com/40oleg/nona/issues/56)).
- Translated the documentation site into Chinese, Hindi, Spanish, French, Arabic, Bengali, Portuguese and Russian ([#58](https://github.com/40oleg/nona/issues/58)).
- The RegExp engine, its Unicode property tables and the Unicode normalization tables are linked only when the program can reach them: a hello world is 3 MB instead of 7 MB. `--full-runtime` (`compile({fullRuntime: true})`) links everything ([#62](https://github.com/40oleg/nona/issues/62)). See [linked runtime parts](https://40oleg.github.io/nona/guide/compatibility#linked-runtime-parts).

## v0.7.0 — 2026-10-01

- Added the global `process` object (`argv`, `env`, `exit`, `exitCode`, `execPath`, `cwd`, `platform`, `arch`, `pid`) and `node:process`/`nona:process` ([#23](https://github.com/40oleg/nona/issues/23)). See [process](docs/process.md).
- Added a synchronous `nona:fs`/`node:fs` subset, global `TextEncoder`/`TextDecoder`, and Linux system call declarations in `nona:ffi` ([#22](https://github.com/40oleg/nona/issues/22)). See [file system](docs/fs.md).
- Added native function calls through the built-in `nona:ffi` module and curated `nona:win32` declarations ([#20](https://github.com/40oleg/nona/issues/20)). See [FFI](docs/ffi.md).
- Counted coroutine stacks towards the collection threshold and added stability tests for long-running programs ([#26](https://github.com/40oleg/nona/issues/26)).
- Added an event loop with `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask` and `performance.now()` ([#21](https://github.com/40oleg/nona/issues/21)). See [host APIs](docs/host-apis.md).
- Made typed array element access, named property lookups on typed arrays, `set` and `apply` with array-likes fast ([#31](https://github.com/40oleg/nona/issues/31)).
- Added Windows resources: `--icon`, `--manifest` (default manifest for GUI programs) and `--version-info` ([#25](https://github.com/40oleg/nona/issues/25)).
- Added `--subsystem console|windows` for GUI programs without a console window; `console.log` drops output when no standard output is available instead of terminating ([#24](https://github.com/40oleg/nona/issues/24)). See [Windows executables](docs/windows-executables.md).
- `eval` with source text known at compile time (string literals, literal concatenations, variables only assigned such constants) is compiled ahead of time with PerformEval semantics: caller scope for direct eval, EvalDeclarationInstantiation for sloppy declarations, completion values, Annex B.3.3.3, and global scope for indirect forms. Run-time computed sources keep the documented `EvalError` exception.
- `Function`/generator/async function constructors are compiled ahead of time when called through variables, `Object.getPrototypeOf(...).constructor`, or literal-source subclasses; run-time sources are converted with ToString before the exception.
- Deep recursion throws `RangeError` ("Maximum call stack size exceeded") instead of terminating the process.
- Objects with long property lists get a hash index; Linux heap allocations use a size-class allocator instead of one `mmap` per object.
- Annex B call-expression assignment targets and RegExp `\c` escapes; TypedArray element writes and descriptors on detached or invalid targets follow the pinned Test262.
- `scripts/test262-audit.ps1`/`.sh` and `scripts/test262-summary.mjs` run and classify full pinned Test262 audits. See [0.17–0.20 status](docs/v0.17-v0.20-status.md).

This release closes the ES2020 roadmap (0.17–0.20) with documented exceptions: `eval` and `Function` with source text computed at run time, other realms for a few constructors, and post-ES2020 semantics. Full pinned Test262 on Windows x64: language 17298/17337, built-ins 15491/15559, Atomics 268/268, Annex B 996/1016. See [0.17–0.20 status](docs/v0.17-v0.20-status.md).

## v0.6.0 — 2026-09-30

- Integrated the ES2020 expansion from [PR #5](https://github.com/40oleg/nona/pull/5): Date/JSON, BigInt, RegExp/String integration, buffers and typed arrays, shared memory and Atomics agents, collections, Proxy/Reflect, and Promise jobs.
- Added async functions/generators, modules and dynamic imports, `with`, realm support, tail calls, and related language/runtime corrections within the documented limits.
- Expanded native Windows/Linux and pinned Test262 coverage, and cached the runtime/prelude code-generation image.
- Updated package and CLI versions together, and corrected sort tests to verify effects without requiring Node.js's implementation-specific comparator call count.

This is an experimental subset release. It does not close the full ES2020 conformance gate. See [v0.6 status](docs/v0.6-status.md) for validation, dynamic-source exceptions, cross-realm gaps, and large-array performance limits.

## v0.5.0 — 2026-09-30

- Added independent String operations, Unicode 17 normalization, and canonical-aware locale comparison.
- Added Number formatting, ES2020 Math methods, and URI encoding/decoding globals on Windows/Linux x64.
- Verified compatible examples on both targets, Unicode normalization, and pinned String/Number/Math catalogs. See [v0.5 status](docs/v0.5-status.md).

## v0.4.0 — 2026-09-26

- Extended the ES2020 Array methods for the supported runtime types, including `concat`, `flat`, `flatMap`, stable `sort`, `toLocaleString`, species handling, and `Symbol.unscopables`.
- Added global `parseInt` and `parseFloat` with Number aliases, and fixed Array iterator completion after source growth.
- Reduced numeric index formatting allocations so million-element sparse Array operations complete without the previous timeouts.
- Expanded pinned Test262 coverage and Windows/Linux native examples. See [v0.4 status](docs/v0.4-status.md) for results and deferred dependencies.

This remains an experimental subset release, with the remaining ES2020 work scheduled through v0.20.

## v0.3.0 — 2026-09-26

- Added standalone Linux x64 ELF output with direct syscalls, native compatibility examples, and a Linux CI job.
- Extended the supported language subset with default and destructuring parameters, array/object/call spread, classes and inheritance, generators and `yield*`, and tagged templates.
- Added selected Math, String, Array, and global numeric built-ins; expanded Symbol, iterator, and object behavior.
- Extended precise GC to suspended generator stacks and new runtime objects, with native stress tests.
- Expanded Windows regression and pinned Test262 smoke coverage. See [v0.3 status](docs/v0.3-status.md) for measured results and remaining gaps.

This is an experimental subset release. It does not complete ES2020; `eval` and dynamic Function constructors remain documented exceptions.

## v0.2.0 — 2026-09-26

- Added arrows, rest parameters, untagged templates, Symbols, `for...in`, `for...of`, iterators, and selected built-ins for the Windows x64 target.
- Established the [ES2020 completion contract](docs/es2020-contract.md) and a pinned Test262 smoke baseline. See [v0.2 status](docs/v0.2-status.md).

## v0.1 — 2026-09-24

Initial public development release.

- Compiles the documented JavaScript subset to standalone Windows x64 PE executables.
- Emits x86-64 machine code directly and includes a small native runtime and precise mark-and-sweep garbage collector.
- Supports functions, closures, objects, arrays, descriptors, strict mode, exceptions, exponentiation, nullish coalescing, and optional chaining within the documented limits.
- Includes a command-line compiler, examples, compatibility programs, and native execution tests.

This release is experimental and does not implement complete ECMAScript or Node.js compatibility. See the [language support matrix](docs/language-support.md) for exact coverage.
