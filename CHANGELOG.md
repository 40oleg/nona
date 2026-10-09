# Changelog

## Unreleased

- `'name' in object` and `hasOwnProperty` calls (`o.hasOwnProperty(k)`, `hasOwn.call(o, k)`) on shaped objects are answered by per-site caches keyed by the shape (and, for `in`, the prototype chain, validated by the shape epoch) instead of a walk through the shapes and an `rt.invoke` of the builtin: a loop of five such checks over 100 objects runs 6.6 times faster ([#195](https://github.com/40oleg/nona/issues/195)).
- Programs with extra realms share the tail-call staging area, the coroutine stack pool and its byte count, the stack limit and the fatal-exit state between realms. Generators and strict tail calls created by another realm's `Function` crashed under GC stress because the collector and the shared JS code used only the main realm's copies; a new test checks that no code shared by all realms refers to a realm's own runtime data ([#198](https://github.com/40oleg/nona/issues/198)).

- On Linux, macOS and the BSDs, `HeapAlloc` blocks of up to 256 KiB (array element tables, index tables, string builders) are carved from 4 MiB arenas and recycled per size class; only larger blocks map their own pages. A loop that builds 20 000 arrays of 2 000 elements and strings made 32 845 `mmap` and 40 115 `munmap` calls and now makes 8 946 and 17 843 (the rest are managed-heap mappings of strings over 64 KiB), and runs in 1.2 s instead of 1.7 s; building arrays of 2 000 elements alone went from 20 109 `mmap` calls to 413, `JSON.stringify` of 2 000 objects with 300-element arrays from 4 071 to 160. `tests/stability.test.ts` uses the Windows sizes on Linux ([#37](https://github.com/40oleg/nona/issues/37)).
- Object literals whose keys are all known at compile time (no spread, computed, accessor, `__proto__` or array-index key) resolve their final shape once per site and store their values into the slots directly, instead of one transition lookup per property: a loop building two small records per iteration runs 3.5 times faster ([#194](https://github.com/40oleg/nona/issues/194)).
- Element reads and writes `a[i]` with an integer index answer dense array slots, typed array elements and string code units in one shared stub before the generic property path; a string's code unit below 256 is a static one-character string instead of a new allocation. marked renders 6% faster, acorn parses 9% faster, and a loop reading and writing array, typed array and string elements runs 2.3× faster ([#193](https://github.com/40oleg/nona/issues/193)).

- Added `examples/angular`: a builder for standard Angular applications that Nona compiles, with the TypeScript compiler, into a native executable; it builds `ng new` into a page that renders like the `ng build` output ([#156](https://github.com/40oleg/nona/issues/156)).

- `Function` calls with literal source are compiled ahead of time also in programs where some function declares its own `Function`: only the calls inside that function are left as written. lodash's top-level `Function('return this')()` threw EvalError because its `runInContext` declares `var Function` ([#196](https://github.com/40oleg/nona/issues/196)).
- A global `RegExp` replace and `String.prototype.replaceAll` join their result once instead of appending to one string, which was quadratic in the number of matches: 20 000 matches of `/ /g` take 0.2 s instead of 3.6 s ([#196](https://github.com/40oleg/nona/issues/196)).
- `examples/lodash`: lodash 4.17.21 and its own test suite compiled by Nona. Everything passes except `_.template`, which compiles code at run time ([#196](https://github.com/40oleg/nona/issues/196)).

- Functions with more than 256 locals (a bundle's top-level scope wrapped in one function, such as typescript.js) treat their locals as live everywhere: liveness, frame slot assignment, the dead-zone check and Number inference no longer grow with locals × operations. A function with 4000 captured locals compiles in 3 s and 239 MB instead of 39 s and 5.2 GB, and typescript.js (9 MB) compiles in 95 s instead of running out of memory ([#162](https://github.com/40oleg/nona/issues/162)).
- Function source text (for `Function.prototype.toString`) is stored once per module, one byte per character when it fits, and each function keeps only its range; the string is created when `toString` is called. Nested functions no longer repeat their enclosing function's text: the Angular builder with typescript.js shrinks from 146 MB to 87 MB ([#164](https://github.com/40oleg/nona/issues/164)).
- `Reflect.construct(F, [literals], newTarget)` with `F` written as `Function` or `x.Function` compiles the source ahead of time, creates the function in `F`'s realm and gives it the prototype `newTarget` selects ([#7](https://github.com/40oleg/nona/issues/7)).

- A sloppy-mode function called with an undefined or null `this` gets the global object of its own realm, not the caller's (OrdinaryCallBindThis) ([#7](https://github.com/40oleg/nona/issues/7)).

- `x.Function(...)` and `new x.Function(...)` with literal source text compile ahead of time like `Function(...)`; when `x.Function` is another realm's `Function`, the function is created in that realm, with its global object, intrinsics and errors ([#7](https://github.com/40oleg/nona/issues/7)).

- Fixed collections in programs with several realms: every realm's runtime now shares the allocator, lazy sweep, weak collection list and the caches the collector invalidates, so objects created by another realm's code are marked and swept with the rest of the heap instead of being freed while still referenced ([#7](https://github.com/40oleg/nona/issues/7)).

- `Promise` instances constructed with a `newTarget` whose `prototype` is not an object get `%Promise.prototype%` of `newTarget`'s realm instead of `%Object.prototype%` ([#7](https://github.com/40oleg/nona/issues/7)).

- `new Function()` and `Reflect.construct(Function, [], newTarget)` take their prototype from `newTarget` (GetPrototypeFromConstructor), falling back to `%Function.prototype%` of `newTarget`'s realm ([#7](https://github.com/40oleg/nona/issues/7)).

- Skip nodejs.org API documentation links in the pages link check: nodejs.org currently answers 404 for its HTML API pages, which failed the check on every branch ([#190](https://github.com/40oleg/nona/issues/190)).

- Made `Array.prototype.shift` and `splice` move the elements of a dense array in one step instead of a Get, Set and HasProperty per element; shifting 20,000 elements one by one went from 6.6 s to 70 ms, and 10,000 middle deletions from 3.5 s to 0.2 s ([#13](https://github.com/40oleg/nona/issues/13)).

- Delete an own property of an object with a property hash index without walking its list: the index records the word that links each node, so deleting the oldest keys first is no longer quadratic (20,000 keys deleted oldest first: 2 s → 22 ms) ([#13](https://github.com/40oleg/nona/issues/13)).

- Moved the 15 probe program sources (platform, process, stream, event, arm64 and self-host probes) from `src/` to `tests/probes/`, so they no longer ship in `dist/src` or in the self-host source tree ([#175](https://github.com/40oleg/nona/issues/175)).

- Re-measured the v0.7.0 micro-benchmark tables for v0.10.0 against Node.js in `PERFORMANCE.md` (Map/Set, sort, Promise and JSON are no longer quadratic; string concatenation and RegExp are the largest remaining gaps), marked the old tables as superseded and documented the measurement protocol in `bench/README.md` ([#180](https://github.com/40oleg/nona/issues/180)).

- Added `docs/architecture.md` (pipeline, layouts, calling convention, machine model, runtime linking) with a test that checks its layout tables against the source, corrected stale statements in `runtime-memory.md`, `es2020-contract.md` and `language-support.md`, and made `docs/README.md` a complete English index ([#171](https://github.com/40oleg/nona/issues/171)).

- Moved per-release status files, deferred Test262 lists, plans, the development log and agent session notes from `docs/` to `docs/history/`; the current status is `docs/status.md`, rewritten per release ([#172](https://github.com/40oleg/nona/issues/172)).

- Add a Lean 4 proof prototype for slot substitution, dead writes, destination coalescing and a modeled straight-line dead-move optimizer, with checked counterexamples, axiom auditing, production IR regressions and proof CI ([#160](https://github.com/40oleg/nona/issues/160)).

- Rewrote the English and Russian READMEs: why Nona, installation from the release builds, a quick start, the supported Node.js APIs as a table, HTTP performance figures, and current development notes ([#153](https://github.com/40oleg/nona/issues/153)).

- Plain objects use shapes (hidden classes): object literals, `new` with ordinary constructors and `JSON.parse` make objects whose named properties are 16-byte slots described by a shared shape, and `object.name` reads, writes and method calls are answered by inline caches after one shape comparison. A five-property object takes 192 bytes instead of about 500; acorn parses 6–13% faster with less than half the peak memory (99 MB instead of 229 MB), and the native compiler's stage 2 build peaks at 3.6 GB. Objects that need more than a shape describes (accessors, `delete`, other attributes, symbol keys) keep using property lists ([#114](https://github.com/40oleg/nona/issues/114)). See [docs/object-model.md](docs/object-model.md).

## v0.10.0 — 2026-10-07

Highlights since v0.9.0:

- **Nona compiles itself.** The compiler builds into a standalone native executable that needs no Node.js, for all eight targets. On Windows and Linux x64 the native compiler rebuilds itself into a byte-identical stage 2. The release has a `nona` build for each target.
- **`process` on all eight targets**: environment, signals, `abort`, `execve`, `title`, CPU and memory usage, credentials and groups, diagnostic reports, `getBuiltinModule`, dotenv loading, and exit and exception events.
- **`node:stream`** with process standard I/O, and `setImmediate`.
- **The synchronous `node:fs` subset** the compiler needs, on every target.

### Native compiler self-hosting

- Begin native compiler bootstrap validation with Nona's directly compiled RegExp engine; correct template-substitution bracket depth and fold long literal Unicode data concatenations without recursive lowering ([#143](https://github.com/40oleg/nona/issues/143)).
- Keep Map and Set hash-index growth from inserting an entry twice, preserving deletion and reinsertion during native compiler liveness analysis ([#143](https://github.com/40oleg/nona/issues/143)).
- Traverse deep module ASTs and binary binding trees iteratively; validate a byte-identical native stage 2 on Windows/Linux x64 and begin full CLI/cache adapter validation. Add exclusive filesystem writes, canonical paths, exact file identities and directory entries needed by the compiler ([#143](https://github.com/40oleg/nona/issues/143)).
- Add original Darwin, FreeBSD and OpenBSD filesystem adapters and actual native compiler execution checks for all eight CPU/OS targets, including BSD guests without Node.js ([#143](https://github.com/40oleg/nona/issues/143)).

### Process and streams

- Integrate Process and public Stream providers with the merged HTTP/network loop, preserving its private fast transport provider and target-supported builtin inventory ([#141](https://github.com/40oleg/nona/issues/141)).
- Preserve allocation-free native coverage output on fatal runtime failures; match report properties for stackless plain objects and keep complete Path stress vectors in bounded batches ([#141](https://github.com/40oleg/nona/issues/141)).
- Pair native Process account and memory GC-stress scenarios with ordinary-allocation oracle runs and bound the new ARM64 Process stress suite at 180 seconds ([#141](https://github.com/40oleg/nona/issues/141)).
- Initialize the canonical EventEmitter only when Events, Stream or process uses it, reducing full-runtime GC-stress startup work without extending Blob deadlines ([#141](https://github.com/40oleg/nona/issues/141)).
- Keep type-only observations of the lazy process descriptor from linking unrelated builtin providers, while retaining inventory for callable or escaping descriptors ([#141](https://github.com/40oleg/nona/issues/141)).
- Validate complete native Stream compositions with ordinary allocation and focused per-API GC-stress cases; use untouched private virtual reservations for genuine macOS allocation-failure reports ([#141](https://github.com/40oleg/nona/issues/141)).
- Preserve native exception messages and error properties in diagnostic reports when stack capture is unavailable, and emit complete BSD probe metadata ([#141](https://github.com/40oleg/nona/issues/141)).
- Preserve native ARM64 condition/parity registers and the link register when returning from OS signal callbacks ([#141](https://github.com/40oleg/nona/issues/141)).
- Isolate Linux ARM64 kernel signal frames on an original native alternate stack to protect the logical JavaScript stack ([#141](https://github.com/40oleg/nona/issues/141)).
- Add an original Immediate check queue with cancellation, ref/unref/disposal, asynchronous context propagation and process reference protocols, required by native Stream pipelines ([#141](https://github.com/40oleg/nona/issues/141)).
- Validate full Stream and builtin-registry GC-stress probes with the standard 60-second oracle budget and preserve failure diagnostics for native pipelines ([#141](https://github.com/40oleg/nona/issues/141)).
- Keep literal calls through immutable local builtin getters selective, retain stream dependencies for folded standard-I/O access, and avoid per-field network snapshot allocations ([#141](https://github.com/40oleg/nona/issues/141)).
- Initialize Stream constructors and process standard I/O on first use so process metadata does not allocate unused stream state ([#141](https://github.com/40oleg/nona/issues/141)).
- Preserve Node 26 read-only native process identity descriptors for platform, architecture, PID and immutable argv0 ([#141](https://github.com/40oleg/nona/issues/141)).
- Add independently authored Node Stream modules and connect process standard I/O to canonical EventEmitter/Readable/Writable constructors, preserving next-tick asynchronous storage and lazy process default lookup ([#141](https://github.com/40oleg/nona/issues/141)).
- Verify emergency process reports through genuine OS-limited allocation failures in isolated native CI children, including absence of JavaScript exit callbacks after unrecoverable failure ([#141](https://github.com/40oleg/nona/issues/141)).
- Add original native process signal registration, restoration and console delivery, plus Nona diagnostic reports with actual network enumeration and an allocation-free emergency writer ([#141](https://github.com/40oleg/nona/issues/141)).
- Instantiated built-in module namespaces only when their reachable graph is requested, preserving cyclic hoisted exports and avoiding eager inventory allocation; unrelated scalar and constructor global reads keep optional runtimes omitted ([#141](https://github.com/40oleg/nona/issues/141)).
- Add immediate OS process.abort termination with real POSIX SIGABRT and Windows status134, bypassing JavaScript lifecycle hooks ([#141](https://github.com/40oleg/nona/issues/141)).
- Add a compiler-linked lazy process.getBuiltinModule registry with real provider defaults, aliases and target capabilities ([#141](https://github.com/40oleg/nona/issues/141)).
- Resolve named initgroups memberships directly from local group records and preserve native permission errors without requiring a passwd entry ([#141](https://github.com/40oleg/nona/issues/141)).
- Publish genuine build-generated Nona process metadata and share its version with the CLI ([#141](https://github.com/40oleg/nona/issues/141)).
- Add process lifecycle finalization with original native weak-key tracking and callback release; match `execve` function reflection ([#141](https://github.com/40oleg/nona/issues/141)).
- Use native bounded copies for process OS file buffers under GC stress, and expose Windows `process.execve` with Node 26's coded platform error ([#141](https://github.com/40oleg/nona/issues/141)).
- Add original OS-backed process.title operations and independently observable native probes on all eight targets ([#141](https://github.com/40oleg/nona/issues/141)).
- Preserve Nona's logical call ABI for Windows ARM64 process helpers and unavailable syscall stubs; retain native marshaling for actual Windows imports ([#141](https://github.com/40oleg/nona/issues/141)).
- Dispatch process exception monitors/capture callbacks and promise rejection lifecycle events from original native entry and job boundaries; preserve Node fatal statuses and promise identities ([#141](https://github.com/40oleg/nona/issues/141)).
- Use bounded original scanners for process account IDs and Linux memory fields under GC stress; keep source boundary fixtures current with native environment ownership ([#141](https://github.com/40oleg/nona/issues/141)).
- Add real POSIX process.execve with original UTF-8 argv/envp ownership, coded nonfatal syscall errors and safe native self-reexecution probes ([#141](https://github.com/40oleg/nona/issues/141)).
- Add actual Windows, Linux/BSD and Darwin current-thread CPU reporting with Node26 previous-value validation ([#141](https://github.com/40oleg/nona/issues/141)).
- Resolve process credential names through original Linux/BSD local account scanners and Darwin OS account services; implement native/local supplementary initgroups ([#141](https://github.com/40oleg/nona/issues/141)).
- Synchronize process.env assignments, deletion and descriptors with an original owned native envp vector on every target; preserve Node CString boundaries and Darwin OS environment consistency ([#141](https://github.com/40oleg/nona/issues/141)).
- Add current native RSS and original allocator-backed process.memoryUsage on all eight targets, including real ArrayBuffer backing accounting and separate retained SharedArrayBuffer allocation counts ([#141](https://github.com/40oleg/nona/issues/141)).
- Added original process dotenv loading, numeric POSIX credentials/groups, active resource/ref APIs and native available/constrained memory queries on all eight targets. Darwin process images use native libSystem Mach bindings; FreeBSD startup vectors use the kernel's RDI entry ABI ([#141](https://github.com/40oleg/nona/issues/141)).
- Fixed reentrant process once listeners, final exit-listener status updates, polling of unreferenced stdin while timers keep the process alive, and the OpenBSD 7.8 `kill` syscall mapping ([#141](https://github.com/40oleg/nona/issues/141)).
- Extended the original `process` adapter to all eight native targets; added `chdir`, `ppid`, `argv0`, `execArgv`, `hrtime`, `uptime`, `nextTick`, validated exit statuses, real standard streams, lifecycle/warning events, environment mutation and native CPU/resource/process control ([#141](https://github.com/40oleg/nona/issues/141)).

### Testing

- Check the same-phase unreferenced timer case in the timers prelude against its fixed expected output instead of a timing-dependent Node.js run ([#151](https://github.com/40oleg/nona/issues/151)).

## v0.9.0 — 2026-10-06

Highlights since v0.8.0:

- **`node:http` and `node:net`** on Linux and Windows x64, with `node:events`, `node:buffer` and `node:string_decoder`. The HTTP server is Nona's own: on the HTTP benchmark it is level with Node.js on small requests, 1.8 times faster on 64 KiB responses and uses a fifth of the memory (see [PERFORMANCE.md](PERFORMANCE.md#http-server)).
- **`node:events`, `node:async_hooks`, `node:path` and the global `Buffer`, `Blob` and `File`**: EventEmitter and EventTarget, `AsyncLocalStorage` with context carried through promises, timers and microtasks, `node:buffer` with Node.js-compatible encodings, and glob matching.
- **Faster runtime for every program**: inline caches for `.length`, `super.name` and global names, cheaper `Object.keys`, `push`/`pop`, `%`, default derived constructors and `JSON.stringify`, and a collector whose pauses only mark (lazy sweeping).
- **Eight native targets**: Linux, Windows and macOS on ARM64, Intel macOS and FreeBSD/OpenBSD x64 join Windows and Linux x64, also in the browser playground.
- **Testing**: native CI for every platform on each pull request, and a corpus of 1,000 combination programs checked against Node.js.

### Networking

- `node:http` runs on Nona's own HTTP/1.1 server and client: request heads are parsed and responses encoded by native code, per-request work Node.js defers is batched, and the runtime got general speedups the server exposed (inline caches for `.length`, `super.name` and global names, cheaper `Object.keys`, `push`/`pop`, `%`, default derived constructors and `JSON.stringify`, size classes that fit 16 KiB buffers, a cheaper mark phase and lazy sweeping). On the HTTP benchmark Nona is level with Node.js on small requests, 1.8 times faster on 64 KiB responses, 10–20% behind on request bodies and uses a fifth of the memory ([#115](https://github.com/40oleg/nona/issues/115)). See [PERFORMANCE.md](PERFORMANCE.md#http-server).
- Added `node:http` (HTTP/1.1 servers, clients and keep-alive agents) and `node:net` (TCP sockets and servers) on Linux and Windows, with `node:events` and `node:string_decoder`; the event loop waits for socket readiness while sockets are open ([#70](https://github.com/40oleg/nona/issues/70)). See [networking](docs/network.md).

### Node.js APIs

- Preserve Web-stream internal Promise handling without discarded species Promises or unused cancellation Promises ([#137](https://github.com/40oleg/nona/issues/137)).
- Preserve Blob reader closed-promise identity during release and avoid duplicate cleanup errors; retain original Promise and lazy asynchronous-storage constructors ([#137](https://github.com/40oleg/nona/issues/137)).
- Initialize asynchronous-context storage only on first API access and preserve root snapshots registered before initialization; avoid a redundant finally handler on ordinary Promise reactions ([#137](https://github.com/40oleg/nona/issues/137)).
- Skip redundant async-context scope calls when Promise reactions, timers and microtasks already run in their captured context, while restoring stores changed by callbacks ([#137](https://github.com/40oleg/nona/issues/137)).
- Retained asynchronous context records directly in Promise reactions, timer records and microtasks, avoiding extra callback wrappers under GC stress ([#137](https://github.com/40oleg/nona/issues/137)).
- Made `AbortSignal.timeout` cancellation timers unreferenced and aligned delay validation error codes with Node.js 26 ([#137](https://github.com/40oleg/nona/issues/137)).
- Reused immutable asynchronous context snapshots to avoid per-reaction Map copies under GC stress; fixed captured store restoration after `enterWith` and `disable`, bind argument validation and exit receiver validation ([#137](https://github.com/40oleg/nona/issues/137)).
- Added `node:events` (`events` / `nona:events`) with EventEmitter, EventTarget and abort globals, listener introspection, native disposal symbols, rejection capture, Promise `once`, async-iterator `on`, NodeEventTarget and manual async-resource context helpers, including protected Blob piping cancellation ([#137](https://github.com/40oleg/nona/issues/137)).
- Read Path working directories and Windows drive environment entries on demand through original target adapters; avoid full process startup for path-only programs under GC stress ([#135](https://github.com/40oleg/nona/issues/135)).
- Added `node:path` and `path` ES modules, including explicit POSIX/Windows variants, path component and resolution APIs, Windows relative paths on POSIX hosts, namespace conversion and Node.js 26 glob matching ([#135](https://github.com/40oleg/nona/issues/135)).
- Added global `Buffer`, `Blob` and `File` and the `node:buffer`, `buffer` and `nona:buffer` modules: typed-array byte storage, standard encodings, numeric access, shared slices, copies, search bounds, aligned allocation and immutable Blob/File data APIs. Blob byte/text streams, BYOB readers and object URL registration/resolution are included ([#136](https://github.com/40oleg/nona/issues/136)).

### Native targets

- Exposed all eight native output targets in the browser playground, including ARM64, macOS and BSD downloads ([#133](https://github.com/40oleg/nona/issues/133)).
- Added native Linux/Windows/macOS ARM64, Intel macOS and FreeBSD/OpenBSD x64 backends, architecture-specific math/call bridges and native CI probes. Apple Silicon uses system dyld/libSystem; see [native platforms](docs/native-platforms.md) ([#117](https://github.com/40oleg/nona/issues/117)).

### Fixes

- Fixed script function declarations shadowing globals installed by JavaScript preludes, including `process`, timers and `TextEncoder`/`TextDecoder`. Global function descriptors are installed after runtime initialization instead of patching static intrinsic properties ([#128](https://github.com/40oleg/nona/issues/128)).
- Fixed script functions such as `escape` and `unescape` shadowing optional built-in globals: runtime preludes initialize before script global aliases become visible ([#126](https://github.com/40oleg/nona/issues/126)).

### Testing and CI

- Run native platform CI for every pull request and `main` commit, extend the portable and host API suites to Linux x64, and make manual runs cover the complete OS matrix ([#131](https://github.com/40oleg/nona/issues/131)).
- Expanded the separate program corpus to 1,000 individually authored combination programs, with per-case purpose catalogs, source hashes, Node.js reference snapshots, ten native test shards and Linux/Windows CI on every push and pull request ([#125](https://github.com/40oleg/nona/issues/125)).
- Added a separate corpus of ten small programs combining algorithms, closures, classes, generators, collections, typed arrays, JSON and async exception cleanup, with fixed expected results and Node.js comparisons in normal and GC-stress execution. A dedicated Linux/Windows workflow runs the corpus on every branch push and pull request ([#123](https://github.com/40oleg/nona/issues/123)).

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
- `scripts/test262-audit.ps1`/`.sh` and `scripts/test262-summary.mjs` run and classify full pinned Test262 audits. See [0.17–0.20 status](docs/status.md).

This release closes the ES2020 roadmap (0.17–0.20) with documented exceptions: `eval` and `Function` with source text computed at run time, other realms for a few constructors, and post-ES2020 semantics. Full pinned Test262 on Windows x64: language 17298/17337, built-ins 15491/15559, Atomics 268/268, Annex B 996/1016. See [0.17–0.20 status](docs/status.md).

## v0.6.0 — 2026-09-30

- Integrated the ES2020 expansion from [PR #5](https://github.com/40oleg/nona/pull/5): Date/JSON, BigInt, RegExp/String integration, buffers and typed arrays, shared memory and Atomics agents, collections, Proxy/Reflect, and Promise jobs.
- Added async functions/generators, modules and dynamic imports, `with`, realm support, tail calls, and related language/runtime corrections within the documented limits.
- Expanded native Windows/Linux and pinned Test262 coverage, and cached the runtime/prelude code-generation image.
- Updated package and CLI versions together, and corrected sort tests to verify effects without requiring Node.js's implementation-specific comparator call count.

This is an experimental subset release. It does not close the full ES2020 conformance gate. See [v0.6 status](docs/history/v0.6-status.md) for validation, dynamic-source exceptions, cross-realm gaps, and large-array performance limits.

## v0.5.0 — 2026-09-30

- Added independent String operations, Unicode 17 normalization, and canonical-aware locale comparison.
- Added Number formatting, ES2020 Math methods, and URI encoding/decoding globals on Windows/Linux x64.
- Verified compatible examples on both targets, Unicode normalization, and pinned String/Number/Math catalogs. See [v0.5 status](docs/history/v0.5-status.md).

## v0.4.0 — 2026-09-26

- Extended the ES2020 Array methods for the supported runtime types, including `concat`, `flat`, `flatMap`, stable `sort`, `toLocaleString`, species handling, and `Symbol.unscopables`.
- Added global `parseInt` and `parseFloat` with Number aliases, and fixed Array iterator completion after source growth.
- Reduced numeric index formatting allocations so million-element sparse Array operations complete without the previous timeouts.
- Expanded pinned Test262 coverage and Windows/Linux native examples. See [v0.4 status](docs/history/v0.4-status.md) for results and deferred dependencies.

This remains an experimental subset release, with the remaining ES2020 work scheduled through v0.20.

## v0.3.0 — 2026-09-26

- Added standalone Linux x64 ELF output with direct syscalls, native compatibility examples, and a Linux CI job.
- Extended the supported language subset with default and destructuring parameters, array/object/call spread, classes and inheritance, generators and `yield*`, and tagged templates.
- Added selected Math, String, Array, and global numeric built-ins; expanded Symbol, iterator, and object behavior.
- Extended precise GC to suspended generator stacks and new runtime objects, with native stress tests.
- Expanded Windows regression and pinned Test262 smoke coverage. See [v0.3 status](docs/history/v0.3-status.md) for measured results and remaining gaps.

This is an experimental subset release. It does not complete ES2020; `eval` and dynamic Function constructors remain documented exceptions.

## v0.2.0 — 2026-09-26

- Added arrows, rest parameters, untagged templates, Symbols, `for...in`, `for...of`, iterators, and selected built-ins for the Windows x64 target.
- Established the [ES2020 completion contract](docs/es2020-contract.md) and a pinned Test262 smoke baseline. See [v0.2 status](docs/history/v0.2-status.md).

## v0.1 — 2026-09-24

Initial public development release.

- Compiles the documented JavaScript subset to standalone Windows x64 PE executables.
- Emits x86-64 machine code directly and includes a small native runtime and precise mark-and-sweep garbage collector.
- Supports functions, closures, objects, arrays, descriptors, strict mode, exceptions, exponentiation, nullish coalescing, and optional chaining within the documented limits.
- Includes a command-line compiler, examples, compatibility programs, and native execution tests.

This release is experimental and does not implement complete ECMAScript or Node.js compatibility. See the [language support matrix](docs/language-support.md) for exact coverage.
