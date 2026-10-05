# Changelog

## Unreleased

- Added native Linux/Windows/macOS ARM64, Intel macOS and FreeBSD/OpenBSD x64 backends, architecture-specific math/call bridges and native CI probes. Apple Silicon uses system dyld/libSystem; see [native platforms](docs/native-platforms.md) ([#117](https://github.com/40oleg/nona/issues/117)).

## v0.8.0 — 2026-10-05

Highlights since v0.7.0:

- **ES2022 classes**: public and private fields, private methods and accessors, static blocks and `#x in obj`, plus a first set of ES2021–ES2023 additions (numeric separators, logical assignment, `Promise.any`, `.at()`, `Object.hasOwn`, Error `cause`, `findLast`).
- **Faster generated code**: inline Number arithmetic, direct calls to known functions, a non-recursive RegExp engine with a linear-time fallback, and faster JSON, spread, await and property lookup.
- **Smaller and faster builds**: preludes and the RegExp engine are linked only when used (a hello world executable is 2.2 MB instead of 7 MB), and the command line caches the compiled runtime (builds after the first are about three times faster).
- **Tooling**: V8-format coverage (`--coverage`), call statistics (`--call-stats`), and diagnostics positioned in the imported module that caused them.
- **Documentation site** with a browser playground, eight translations, the performance comparison and the V8-inspired roadmap; a real-world benchmark corpus (acorn, marked).

### Language

- Added features newer than ES2020: numeric separators, logical assignment (`&&=`, `||=`, `??=`), `Promise.any` and `AggregateError`, `.at()` on arrays, strings and typed arrays, `findLast`/`findLastIndex`, `Object.hasOwn` and the `cause` option of error constructors ([#69](https://github.com/40oleg/nona/issues/69)).
- Added the ES2022 class elements: public and private instance and static fields, private methods and accessors, static initialization blocks and `#x in obj`. Fields are defined (not assigned) when the instance is initialized, at the start of a base constructor or when `super()` returns; private names are checked at compile time and create new names each time the class is evaluated ([#106](https://github.com/40oleg/nona/issues/106)).

### Performance

- Hot loops over numbers are several times faster: the compiler drops dead-zone checks of initialized `let`/`const` bindings, forwards copies, infers which values are Numbers and emits their arithmetic, comparisons and updates inline without type checks, fuses a comparison into the branch that uses it, and skips the GC poll in blocks that cannot allocate; the smaller code also makes a hello world 2.2 MB instead of 2.4 MB ([#94](https://github.com/40oleg/nona/issues/94)).
- Calls to function declarations known at compile time check that the callee still runs that code and call it directly instead of going through the general dispatch: a loop of calls is 1.5 times faster ([#96](https://github.com/40oleg/nona/issues/96)).
- Own property lookups compare key records by identity and length before their characters, and `object.name` reads keep the key's hash in their inline cache instead of rehashing it: acorn parses 11% and marked renders 8% faster ([#112](https://github.com/40oleg/nona/issues/112)).
- A regular expression whose every alternative starts with `^` (without the `m` flag) is only tried at the start of the input, so a failing search no longer scans the whole string; marked, whose lexer runs such patterns against the rest of the document, renders 20 times faster ([#107](https://github.com/40oleg/nona/issues/107)).
- A regular expression without backreferences or lookarounds that backtracks excessively is finished by a linear-time engine (a Pike VM) with the same result: `/(a+)+b/` on 28 `a`s takes milliseconds instead of minutes ([#98](https://github.com/40oleg/nona/issues/98)).
- Replaced the recursive continuation-passing RegExp matcher with a backtracking interpreter: a pattern is translated once into a small instruction program that runs on explicit stacks, so long inputs no longer exhaust the stack and the 500 000-step backtracking limit (which made `/abc(\d{3})-/g` fail on a 1.6 MB string) is gone. A match call is 3–9 times cheaper ([#14](https://github.com/40oleg/nona/issues/14)).
- Made `JSON.stringify` 3.2 times and `JSON.parse` 2.7 times faster on a 30 MB document: strings are quoted and integers written straight into the output, array elements are read and written with number keys, and `JSON.parse` shares repeated keys and converts short decimals exactly without going through their text ([#88](https://github.com/40oleg/nona/issues/88)).
- Made spread, array destructuring and array rest step built-in array iterators directly and append elements to the dense element store: `[...a]` and `const [x, ...rest] = a` are 5–8 times faster ([#65](https://github.com/40oleg/nona/issues/65)).
- Reused released coroutine stacks instead of mapping a fresh megabyte for every async call and generator, and created an async function's continuations only when it awaits: a loop of awaited async calls is 1.6 times faster ([#68](https://github.com/40oleg/nona/issues/68)).
- Seeded the string and number hashes of the property index and of Map, Set, WeakMap and WeakSet per process, so colliding keys cannot be prepared in advance (hash flooding) ([#66](https://github.com/40oleg/nona/issues/66)).
- The collector marks strings and other reference-free blocks without queueing them for tracing, and in GC stress mode fills freed cells with a poison pattern so a missing root fails at once instead of when the cell is reused ([#67](https://github.com/40oleg/nona/issues/67)).

### Executable size and build time

- The RegExp engine, its Unicode property tables and the Unicode normalization tables are linked only when the program can reach them: a hello world is 3 MB instead of 7 MB. `--full-runtime` (`compile({fullRuntime: true})`) links everything ([#62](https://github.com/40oleg/nona/issues/62)). See [linked runtime parts](https://40oleg.github.io/nona/guide/compatibility#linked-runtime-parts).
- Built-in libraries written in JavaScript (`Proxy`, `TextEncoder`/`TextDecoder`, `process`, timers, the ES2021 additions, Annex B `escape`/`substr`/…, the stable `sort`, `Object.freeze`/`seal` and the legacy accessor methods) are linked only when a source names them: a hello world is 2.4 MB instead of 3.2 MB ([#84](https://github.com/40oleg/nona/issues/84)).
- The command line keeps the compiled runtime and preludes in a cache directory (`NONA_CACHE_DIR`, `NONA_CACHE=0` to disable), so builds after the first are about three times faster with identical output ([#86](https://github.com/40oleg/nona/issues/86)). See [Runtime cache](https://40oleg.github.io/nona/reference/cli#runtime-cache).

### Fixes

- Fixed `super.x` and `super.x = v` with a Proxy in the prototype chain: they go through its `get` and `set` traps with the original receiver, as `base.[[Get]]`/`[[Set]]` require, instead of its `getOwnPropertyDescriptor` trap ([#91](https://github.com/40oleg/nona/issues/91)).
- Fixed RegExp literals whose group names contain non-ASCII characters or escapes (`/(?<𝒜>b)/u`): such a program now links the identifier tables the name check needs instead of failing at run time ([#80](https://github.com/40oleg/nona/issues/80)).
- Fixed errors in imported modules being reported against the entry file, which could also crash the command line with "Source offset … is outside the source text" ([#102](https://github.com/40oleg/nona/issues/102)).
- Fixed a crash when a property was looked up on an object with more than 32 own properties that also had indexed elements, such as `Math[1] = true; Array.prototype.indexOf.call(Math, true)` ([#119](https://github.com/40oleg/nona/issues/119)).

### Tooling

- Added coverage builds: `--coverage <dir>` (`compile({coverage: {directory, url}})`) makes the program write per-function call counts in the `NODE_V8_COVERAGE` format when it ends, for `c8 report` ([#100](https://github.com/40oleg/nona/issues/100)).
- Added call-statistics builds: `--call-stats` (`compile({callStats: true})`) counts every call the program and its runtime make and prints the counts to stderr when the program ends, most frequent first ([#90](https://github.com/40oleg/nona/issues/90)).

### Benchmarks

- Added a real-world benchmark corpus: `node bench/real/fetch.mjs` downloads pinned libraries from npm and `node bench/run.mjs --real` runs them on Nona and the installed runtimes; it starts with acorn parsing its own source, 14 times slower than Node.js on the first parse ([#104](https://github.com/40oleg/nona/issues/104)). See [PERFORMANCE.md](PERFORMANCE.md#real-world-code).
- Added marked to the real-world benchmark corpus (`bench/real/marked.mjs`): it renders a 200-section Markdown document ([#110](https://github.com/40oleg/nona/issues/110)).

### Documentation

- Added the documentation site on GitHub Pages: https://40oleg.github.io/nona/ ([#49](https://github.com/40oleg/nona/issues/49)).
- Translated the documentation site into Chinese, Hindi, Spanish, French, Arabic, Bengali, Portuguese and Russian ([#58](https://github.com/40oleg/nona/issues/58)).
- Added a playground to the documentation site: the compiler runs in the browser and produces a Windows or Linux executable to download ([#56](https://github.com/40oleg/nona/issues/56)).
- Published the performance comparison with Node.js, Deno and Bun on the documentation site, with startup time, executable size and memory on the home page ([#55](https://github.com/40oleg/nona/issues/55)).
- Added the [roadmap](docs/roadmap.md) from a review of the V8 blog, with the planned target architectures ([#64](https://github.com/40oleg/nona/issues/64)).

### Development

- Native test runs retry removing their temporary directory and no longer fail when Windows keeps a just-exited executable locked ([#78](https://github.com/40oleg/nona/issues/78)).

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
