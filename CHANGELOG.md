# Changelog

## Unreleased

### Runtime

- `WeakRef` with `deref()` ([#304](https://github.com/40oleg/nona/issues/304)). A target reachable only through WeakRefs is collected; `deref()` and the constructor keep the target alive until the end of the current job (KeepDuringJob, cleared around every microtask checkpoint). The runtime part is linked only when a program names `WeakRef`, so other programs do not grow. `built-ins/WeakRef` passes 26/26 in Test262; `FinalizationRegistry` is still not supported. Symbols are rejected as targets.

## v0.15.0 — 2026-10-17

### Runtime

- `WeakRef` with `deref()` ([#304](https://github.com/40oleg/nona/issues/304)). A target reachable only through WeakRefs is collected; `deref()` and the constructor keep the target alive until the end of the current job (KeepDuringJob, cleared around every microtask checkpoint). The runtime part is linked only when a program names `WeakRef`, so other programs do not grow. `built-ins/WeakRef` passes 26/26 in Test262. Symbols are rejected as targets.
- `FinalizationRegistry` with `register`/`unregister` ([#305](https://github.com/40oleg/nona/issues/305)). Cleanup callbacks run as a host job from the event loop after a collection is seen at a checkpoint, never inside the collector, and pending cleanup does not keep the process alive. The runtime part is linked only when a program names `FinalizationRegistry`. `built-ins/FinalizationRegistry` passes 45/47 in Test262; the two failures need symbols as targets or tokens, which are rejected.
- **`Intl` for the `en` locale.** Nona's own `Intl` without ICU: `NumberFormat` (decimal, percent, currency, unit, compact, scientific and engineering notation, significant and fraction digits, rounding, `formatToParts`, `formatRange`), `DateTimeFormat` (`dateStyle`/`timeStyle` and component options, UTC and fixed offsets, `formatToParts`, `formatRange`), `Collator`, `PluralRules`, `getCanonicalLocales`, `supportedLocalesOf` and `supportedValuesOf`, and `Number`/`BigInt`/`Date.prototype.toLocale*String` and `String.prototype.localeCompare` delegating to them. Only `en` and `en-US` are available; other locales fall back to `en-US` and `resolvedOptions().locale` says so. The part is linked when a program names `Intl` or a `toLocale*`/`localeCompare` method. [docs/intl.md](docs/intl.md) lists the supported options, the limitations and the Test262 `intl402` results. ([#300](https://github.com/40oleg/nona/issues/300))
- `Error.captureStackTrace`, `Error.stackTraceLimit` and `Error.prepareStackTrace` (the V8 stack API that `depd`, `http-errors` and Express call at load time). Nona does not walk the stack, so `captureStackTrace` defines `stack` as the `name: message` header, or passes `prepareStackTrace` an array of placeholder CallSite objects with unknown locations. ([#298](https://github.com/40oleg/nona/issues/298))
- `EventEmitter` methods work on a target whose own `_events` is `undefined` (the emitter prototype's descriptors copied onto a function or object, as Express does) and when called with `.call` on a plain object: `_events` is created lazily like Node.js, and the max-listeners check no longer calls `getMaxListeners()` on the target. ([#298](https://github.com/40oleg/nona/issues/298))

### Host APIs

- **`zlib`** (`node:zlib`, `zlib`, `nona:zlib`): Nona's own DEFLATE codec with zlib and gzip framing, Adler-32 and CRC-32, and the synchronous, callback and stream APIs of Node.js (`deflateSync`, `gunzipSync`, `createGzip`, …, `crc32`, `constants`, error codes compatible with Node.js). Brotli is not provided. Compressed bytes are valid but not byte-identical to Node.js's zlib, and the `http` client does not decompress responses, as in Node.js. See [zlib](docs/host-apis.md#zlib). ([#302](https://github.com/40oleg/nona/issues/302))

## v0.14.0 — 2026-10-16

### Runtime

- `node:fs` gains `lstatSync`, `readlinkSync` (symbolic links, and junctions on Windows), `realpathSync.native`, `accessSync`, `rmSync`, a full `fs.Dirent` (all `is*()` methods, `parentPath`, `path`) for `readdirSync(path, {withFileTypes: true})`, the `Stats` device/FIFO/socket tests, Node.js callback forms of the common functions and `fs.promises`, also as the new `node:fs/promises` module (`fs/promises`, `nona:fs/promises`). Packages such as glob's path-scurry now compile. ([#297](https://github.com/40oleg/nona/issues/297))
- `EventEmitter.prototype.once` and `prependOnceListener` register their wrapper through `this.on` and `this.prependListener`, as in Node.js, so a subclass that overrides `on` (minipass starts data flow there) sees `once('data')` listeners. `for await` over a minipass stream and glob's `Glob` iterators and streams no longer hang. ([#297](https://github.com/40oleg/nona/issues/297))
- **`Promise.withResolvers`** (ES2024) returns `{ promise, resolve, reject }` for `this` as the constructor, so subclasses work. ([#312](https://github.com/40oleg/nona/issues/312))
- Helpers that only some syntax needs (`with`, literal `eval`, class fields and private names, ES module records and `import()`) are separate prelude parts, linked when the compiled program calls them. An empty program on linux-x64 shrinks to 1.11 MB. ([#278](https://github.com/40oleg/nona/issues/278))
- **Smaller executables.** The runtime no longer links code a program cannot use: the `ArrayBuffer`/`TypedArray`/`DataView` JavaScript methods (`binaryData`) and the RegExp/String protocol methods (`regexpProtocol`) are separate prelude parts chosen by the source scan, and prelude functions no longer embed their source text (they print as `[native code]`). An empty program on linux-x64 shrinks from 1.72 MB to 1.20 MB. ([#265](https://github.com/40oleg/nona/issues/265))
- **axios runs.** `node:https` (`Agent` and `globalAgent`; requests throw `ERR_NONA_UNSUPPORTED`), `node:tls`, `node:http2` and `node:zlib` exist with the Node.js constants so that HTTP clients load; `process` has `Symbol.toStringTag` `'process'`; and a socket inactivity timeout fires after a timer with the same delay set before it, as in Node.js (axios reported `socket hang up` instead of its timeout error). ([#292](https://github.com/40oleg/nona/issues/292))

- `crypto.hkdf` and `crypto.hkdfSync` (HKDF, RFC 5869, with Node's argument checks and an `ArrayBuffer` result), and the internal module `nona:internal/tls-crypto` with the primitives of the coming TLS client: TLS 1.3 HKDF-Expand-Label, AES-128/256-GCM, ChaCha20-Poly1305, X25519, P-256/P-384 ECDH, ECDSA and RSA (PKCS#1 v1.5, PSS) signature verification and a DER reader, in JavaScript without external code. ([#301](https://github.com/40oleg/nona/issues/301))
- `node:tls` (also `tls`, `nona:tls`) on win32-x64 and linux-x64: a TLS 1.3 client (`tls.connect`, `TLSSocket`) with SNI, ALPN, HelloRetryRequest, KeyUpdate, the three TLS 1.3 cipher suites and ECDSA/RSA-PSS certificates, checked against the RFC 8448 handshake trace and Node.js servers. TLS 1.2 is not implemented (`ERR_SSL_UNSUPPORTED_PROTOCOL`). ([#301](https://github.com/40oleg/nona/issues/301))
- TLS certificate verification: X.509 chains are built and checked like Node.js/OpenSSL do (out-of-order chains, CA flags and path lengths, `serverAuth`, key usage, critical extensions, name constraints, RSA PKCS#1/PSS and ECDSA signatures, validity periods), with Node's error codes; host names per RFC 6125 (`tls.checkServerIdentity`); trust anchors from the `ca` option or the operating system's store (a PEM bundle on Linux, the ROOT/CA system stores on Windows), also listed by `tls.rootCertificates`. No revocation checks. ([#301](https://github.com/40oleg/nona/issues/301))
- `node:https` (also `https`, `nona:https`) on win32-x64 and linux-x64: `https.request`, `https.get`, `https.Agent` and `globalAgent` with keep-alive pooling keyed by the TLS options, over `node:tls`. The https client is client-only and TLS 1.3-only; there is no global `fetch` yet. Limitations are listed in [networking](docs/network.md#security-limitations). ([#301](https://github.com/40oleg/nona/issues/301))
- **Global `crypto`.** The Web Crypto global (`crypto.getRandomValues`, `crypto.randomUUID`) is `node:crypto`'s `webcrypto`, linked when a program names `crypto`; packages such as `uuid` use it without importing `node:crypto`. ([#296](https://github.com/40oleg/nona/issues/296))
- **npm: `module.createRequire` and CommonJS requires.** `createRequire(filename)` from `node:module` returns a working `require` for the modules the program contains at compile time (the literal requires of the calling file, the program's CommonJS files and modules other files require); other ids throw `MODULE_NOT_FOUND`. CommonJS files get the literal requires made through `createRequire`, `require()` of an ES module returns its namespace, and `createRequire` is resolved through destructuring and `module.createRequire` too. ([#299](https://github.com/40oleg/nona/issues/299))
- **`node:fs` callbacks.** `readFile`, `writeFile`, `appendFile`, `stat`, `realpath`, `readdir`, `mkdir`, `rmdir`, `unlink`, `rename`, `copyFile` and `exists` run their synchronous function and call back on a later turn. ([#299](https://github.com/40oleg/nona/issues/299))
- **`Intl.Segmenter`** splits grapheme clusters (UAX #29), which `string-width` and `cliui` use for terminal columns; the other `Intl` services are still not available. ([#299](https://github.com/40oleg/nona/issues/299))
- **yargs** (18.2) runs with the output of Node.js for the typical API (options, aliases, commands, `.strict()`, `--help`, `--version`, errors) and is listed as a tested package; see [npm packages](docs/npm.md#tested-packages) for the two differences that remain. ([#299](https://github.com/40oleg/nona/issues/299))

- RegExp match indices (ES2022): the `d` flag in literals and the `RegExp` constructor, `RegExp.prototype.hasIndices`, and the `indices` array (with `groups`) of `exec`, `match` and `matchAll` results. A `d` regexp runs in the RegExp VM. Test262 `built-ins/RegExp/match-indices` and `built-ins/RegExp/prototype/hasIndices` pass completely. ([#307](https://github.com/40oleg/nona/issues/307))

- **RegExp pattern modifiers (ES2025).** `(?i:…)`, `(?-i:…)` and `(?ims-ims:…)` change the `i`, `m` and `s` flags for the atoms inside the group; the spec's early errors (a repeated or conflicting flag, `(?-:`, other letters, a missing colon) are SyntaxErrors. Such groups do not capture. Patterns without modifiers are unaffected. ([#320](https://github.com/40oleg/nona/issues/320))

### Performance

- `Array.prototype.shift` and `splice` on large dense arrays move their slots with 64-byte vector copies instead of `rep movsb`, which is slow for overlapping ranges: about ten times faster (50,000 shifts of a 50,000-element array: 6.5 s → 0.6 s). ([#262](https://github.com/40oleg/nona/issues/262))
- `%` of two int32 Numbers runs inline (`idiv`, or a mask for a constant power-of-two divisor and a non-negative dividend) instead of calling the runtime; fractions, NaN, Infinity, `-0` and zero divisors keep the runtime's fmod semantics. A loop of `i % 7` and ring-buffer indexing runs about 1.8 times faster. ([#238](https://github.com/40oleg/nona/issues/238))
- A `switch` whose case tests are literals, with at least four distinct int32 Number cases in a dense range, dispatches through a jump table (a new IR terminator `switch`); other values still take the compare chain, so `'1'`, `1n`, fractions and objects behave as before. A lexer-style loop over character codes runs 22% fewer instructions in the program's own code. ([#241](https://github.com/40oleg/nona/issues/241))
- A closure's read of a captured `let`/`const`/`class` binding has no dead-zone check when every place that creates the closure runs after the binding is initialized; hoisted declarations and closures created earlier keep their checks. marked compiles with 29% fewer checks (1,768 → 1,261). ([#242](https://github.com/40oleg/nona/issues/242))
- A nullish test (`x?.y`, `x ?? y`) of a value already tested on the same path (`x === null || x === undefined`, `x != null`, `typeof x === 'string'`, …) or known to be an object, function or Number folds away. ([#237](https://github.com/40oleg/nona/issues/237))
- The RegExp engine skips start positions where no match can begin: a pattern whose matches start with one of up to eight code units (`/[<>&"']/`, `/fox|dog/`, `/k/i`) scans for them natively, eight units per vector step (`__nonaRegexpScan`), and a leading literal run (`abc` of `/abc(\d+)/`) is found with `indexOf` as a whole. Searching a 200 KB string for `/[<>]/` is about 200 times faster; marked spends about 13% fewer instructions in the engine. ([#258](https://github.com/40oleg/nona/issues/258))

### Tools

- `--link part,...` links single optional runtime parts (for a program that reaches them only through names built at run time), and `--print-link` lists the linked parts with the name or option that selected each. [docs/runtime-linking.md](docs/runtime-linking.md) records the decision to keep the lexical linking rule. ([#182](https://github.com/40oleg/nona/issues/182))

### Internals

- CI: when GitHub-hosted Windows jobs are already queued, the Windows jobs of `check` and `program corpus` run on the owner's self-hosted Windows runner if it is online and idle; a `route` job (`scripts/pick-runner.mjs`) decides, and pull requests from forks always stay hosted ([docs/ci-runners.md](docs/ci-runners.md), [#359](https://github.com/40oleg/nona/issues/359)).
- CI: a pull request runs about 190 instead of 452 runner-minutes. The platform suites (`native-platforms`, `self-hosting`) run on `main` and on pull requests labelled `full-ci`; on `main` the heavy workflows check the last commit of a burst of merges while `check` still runs on every commit; a new push to a pull request now cancels its previous `native-platforms` run. ([#353](https://github.com/40oleg/nona/issues/353))
- `src/ir/lower.ts`: the literal, template, `this`, `import`, `yield` and `await` expression cases moved into per-kind methods of `src/ir/lower/expressions.ts`; the emitted IR is unchanged. ([#290](https://github.com/40oleg/nona/issues/290))
- The module records prelude part takes `append` from the promise prelude again, stray `process.report` test outputs are no longer committed, and the closure dead-zone analysis of #242 only runs where a closure checks an initialization and below the pinned locals threshold: a function with thousands of `var`s and closures compiled 6× slower and ran out of memory. ([#287](https://github.com/40oleg/nona/issues/287))
- [docs/intrinsics.md](docs/intrinsics.md) records the decisions on the logical-x64 machine model and the `__nonaRegexpVm` intrinsic namespace, and `tests/intrinsics.test.ts` checks that every intrinsic the preludes and the runtime read is defined. ([#183](https://github.com/40oleg/nona/issues/183))

### Fixes

- In unicode mode (`u`), a lone surrogate in a pattern no longer matches half of a surrogate pair, and `matchAll` with such a pattern no longer loops. ([#277](https://github.com/40oleg/nona/issues/277))

### Documentation

- `AGENTS.md` has a release checklist: every release re-measures `PERFORMANCE.md` and updates the figures the READMEs and the site quote. ([#283](https://github.com/40oleg/nona/issues/283))
- PERFORMANCE.md compares the current `main` with Node.js, Deno and Bun again: start-up, size, memory, the micro-benchmarks and acorn/marked. ([#267](https://github.com/40oleg/nona/issues/267))
- The site's How it works page describes where the runtime uses SIMD (SSE2/NEON) and links the measurements of `docs/simd.md`. ([#268](https://github.com/40oleg/nona/issues/268))
- The documentation site is restructured and brought up to date with v0.12: a new install section and a clearer sidebar (language and compatibility, tools, host APIs), one platforms page instead of a pasted paragraph on every page, repaired tables, no stale issue links or Test262 labels, and translations aligned with the English pages ([#263](https://github.com/40oleg/nona/issues/263)).

## v0.12.0 — 2026-10-13

Highlights since v0.11.0:

- **npm packages.** Programs can import packages from `node_modules`: Nona resolves them at build time as Node.js does (`exports`, `imports`, conditions, pnpm stores) and compiles CommonJS, ES modules and JSON into the executable. 33 of 36 popular packages tested print the same as on Node.js. `nona build <package directory>` builds a package's `bin`, and new built-in modules (`node:os`, `node:util`, `node:crypto`, `node:url`, `node:assert`, …) cover what packages commonly need.
- **SIMD in the runtime.** String comparison, substring search, `split`/`replaceAll`, string copies and allocation zeroing use 128-bit vectors (SSE2 on x86-64, NEON on ARM64): long-string scans run 53% fewer instructions.
- **Typed arrays.** `fill`, `copyWithin`, `slice`, `set` and the searches `indexOf`/`lastIndexOf`/`includes` work on memory in blocks instead of element by element: 10–45× faster, and faster than Node.js on the benchmark.
- **Faster `===` on strings.** npm packages that compare many strings run 8–10% fewer instructions.
- **Tooling.** An instruction profiler for the runtime (`scripts/profile-runtime.mjs`), and the whole repository formatted with Prettier.

### npm packages

- Programs can use npm packages: Nona resolves `node_modules` at build time as Node.js does (`package.json` `exports` with subpath patterns and conditions, `imports`, self-reference, `main`, `type`, symbolic links and pnpm stores) and compiles CommonJS modules, ES modules and JSON into the executable. CommonJS works as in Node.js (the module wrapper, `module.exports`, `require.cache`, `require.resolve`, cycles, sloppy mode, retry after a failed load); ES modules import CommonJS named exports found by a `cjs-module-lexer`-style scan, and `require()` of an ES module returns its namespace. A CommonJS entry file is compiled with everything it requires. Compile errors in packages name the package file. 33 of 36 popular packages tested (lodash, chalk, commander, dayjs, date-fns, marked, js-yaml, semver, uuid, zod, …) print the same as on Node.js; see [docs/npm.md](docs/npm.md) ([#249](https://github.com/40oleg/nona/issues/249)).
- `nona build <package directory>` builds the package's `"bin"` command or `"main"` module; `--conditions <name>` (`-C`, compile option `conditions`) adds `exports` conditions ([#249](https://github.com/40oleg/nona/issues/249)).
- New built-in modules for packages: `node:os`, `node:tty`, `node:util` (`format`, `inspect`, `inherits`, `promisify`, `types`, …), `node:url`, `node:assert`, `node:crypto` (OS random values, `randomUUID`, MD5/SHA-1/SHA-256/SHA-384/SHA-512 hashes and HMAC), `node:querystring`, `node:timers`, `node:timers/promises`, `node:perf_hooks`, `node:module`, `node:worker_threads` and a `node:child_process` whose functions throw `ERR_NONA_UNSUPPORTED` ([#249](https://github.com/40oleg/nona/issues/249)).
- The global `URL` is a URL Standard parser (it parsed only `blob:` object URLs before), and `URLSearchParams` is available ([#249](https://github.com/40oleg/nona/issues/249)).
- `import.meta` has `url`, `filename` and `dirname` ([#249](https://github.com/40oleg/nona/issues/249)).
- Import attributes (`import data from './x.json' with {type: 'json'}`, and the older `assert`) are accepted, and a RegExp literal may follow `export default` ([#249](https://github.com/40oleg/nona/issues/249)).

### Performance

- `===` and `!==` on two strings compare them in `rt.strictEquals` (same record, then the lengths, then the code units 16 bytes per step) instead of going through the generic comparison; `Array.prototype.indexOf`/`includes`, `Map`, `Set` and the other runtime users of strict equality take the same path. npm packages that compare many strings (js-yaml, semver, validator) run 8–10% fewer instructions ([#257](https://github.com/40oleg/nona/issues/257)).
- Typed arrays: `fill`, `copyWithin`, `slice` and `set` between arrays of one type copy and fill memory in blocks (16 bytes per step), and `indexOf`, `lastIndexOf` and `includes` compare Number elements in place, 16 bytes per step for integer types, instead of reading every element as a value; on ARM64 every block copy of the runtime moves 16 bytes per step. `bench/17_typed_arrays.js` runs 81% fewer instructions ([#253](https://github.com/40oleg/nona/issues/253)).
- The runtime uses 128-bit SIMD (SSE2 on x86-64, NEON on ARM64) for string comparison, the first-character scan of `indexOf`, `includes`, `lastIndexOf`, `split` and `replaceAll`, the unit copies of `slice`, `substring`, `substr` and RegExp captures, and the zeroing of small allocations. `bench/16_string_scan.js` runs 53% fewer instructions; see [docs/simd.md](docs/simd.md) ([#253](https://github.com/40oleg/nona/issues/253)).

### Development

- `scripts/profile-runtime.mjs` counts the instructions each runtime routine executes (QEMU trace), `bench/16_string_scan.js` measures long-string scans, and [docs/simd.md](docs/simd.md) reports where SIMD would help ([#253](https://github.com/40oleg/nona/issues/253)).
- All sources, tests, scripts, docs and site pages are formatted with Prettier 3 (4-space indent, other options at their defaults). `npm run format` formats them and the `format` CI job runs `npm run format:check`; `.prettierignore` lists generated files and the prelude templates with substitutions. Target-specific edits of built-in sources now fail loudly when their text is not found ([#250](https://github.com/40oleg/nona/issues/250)).

## v0.11.0 — 2026-10-11

Highlights since v0.10.0:

- **Shapes and inline caches.** Plain objects use shapes (hidden classes); object literals with constant keys get their shape at compile time, and inline caches answer property reads, `in`, `hasOwnProperty`, element access on dense and typed arrays, function objects and typed array `.length`.
- **A cheaper calling convention.** One shared prologue stub, stack maps instead of clearing dead frame slots, and one static descriptor per closure and call site: the code generated for lodash is about 40 % smaller than in v0.10.0. Calls and `new` run 7–22 % faster.
- **No more quadratic string building.** A long `s += x` is a rope: 200 000 appends take 80 ms instead of 37 s. A global `replace` of many matches is no longer quadratic either.
- **An IR optimizer.** Constant folding and propagation, removal of branches on known conditions and of empty blocks, Number facts from `typeof` guards, and inline comparisons with constants (`bench/05_array`: −10 % instructions).
- **Realms per ECMA-262.** Another realm's `Function`, `eval` with literal source, `Reflect.construct` with dynamic constructors, and the errors of derived constructors are created in the right realm.
- **Tooling.** `nona build --print-asm`, located `E_INTERNAL` diagnostics for compiler bugs, `console.error`/`warn`/`info`/`debug`, and a release workflow that publishes the native compiler for all eight targets from a `v*` tag.
- **Examples.** lodash 4.17.21 with its own test suite, and a builder for standard Angular applications, both compiled by Nona.

### Objects, properties and allocation

- Plain objects use shapes (hidden classes): object literals, `new` with ordinary constructors and `JSON.parse` make objects whose named properties are 16-byte slots described by a shared shape, and `object.name` reads, writes and method calls are answered by inline caches after one shape comparison. A five-property object takes 192 bytes instead of about 500; acorn parses 6–13% faster with less than half the peak memory (99 MB instead of 229 MB), and the native compiler's stage 2 build peaks at 3.6 GB. Objects that need more than a shape describes (accessors, `delete`, other attributes, symbol keys) keep using property lists ([#114](https://github.com/40oleg/nona/issues/114)). See [docs/object-model.md](docs/object-model.md).
- Object literals whose keys are all known at compile time (no spread, computed, accessor, `__proto__` or array-index key) resolve their final shape once per site and store their values into the slots directly, instead of one transition lookup per property: a loop building two small records per iteration runs 3.5 times faster ([#194](https://github.com/40oleg/nona/issues/194)).
- `'name' in object` and `hasOwnProperty` calls (`o.hasOwnProperty(k)`, `hasOwn.call(o, k)`) on shaped objects are answered by per-site caches keyed by the shape (and, for `in`, the prototype chain, validated by the shape epoch) instead of a walk through the shapes and an `rt.invoke` of the builtin: a loop of five such checks over 100 objects runs 6.6 times faster ([#195](https://github.com/40oleg/nona/issues/195)).
- Inline caches hit on function objects and typed arrays: a read site remembers the own property of a function object (static members, `Ctor.prototype`, `f.length`), and `.length` of a typed array is read without calling the `%TypedArray%.prototype.length` getter while that accessor is the intrinsic one. A loop of static member and typed array `length` reads runs 2.6 times faster; acorn parses 8% faster ([#192](https://github.com/40oleg/nona/issues/192)).
- Element reads and writes `a[i]` with an integer index answer dense array slots, typed array elements and string code units in one shared stub before the generic property path; a string's code unit below 256 is a static one-character string instead of a new allocation. marked renders 6% faster, acorn parses 9% faster, and a loop reading and writing array, typed array and string elements runs 2.3× faster ([#193](https://github.com/40oleg/nona/issues/193)).
- Array literals without holes or spread are created with their element table in one call and store their elements into it directly, instead of one `rt.setProperty` per element, and shaped objects are written once instead of being cleared first: a loop allocating 5M two-element arrays runs 12% faster, one allocating 5M two-property literals 12% faster, and the short-lived object benchmark (`bench/09_gc.js`, 5M `{a, b: [..], c: {..}}`) takes 0.91 s instead of 1.71 s together with the static literal shapes of #194 ([#48](https://github.com/40oleg/nona/issues/48)).
- Array literals with up to eight table slots keep their element table inside the array's own cell instead of a separate raw-heap block, so creating one is a single managed allocation and its death releases nothing; arrays (`rt.newObject`) are no longer cleared before their header is written, and `rt.allocRaw` pops a small cell from its class's free list without a frame. The short-lived object benchmark (`bench/09_gc.js`, scale 0.1, Linux x64) takes 124.6 ms instead of 160.0 ms (Node.js: 20.5 ms), 27 % fewer instructions ([#48](https://github.com/40oleg/nona/issues/48)).
- On Linux, macOS and the BSDs, `HeapAlloc` blocks of up to 256 KiB (array element tables, index tables, string builders) are carved from 4 MiB arenas and recycled per size class; only larger blocks map their own pages. A loop that builds 20 000 arrays of 2 000 elements and strings made 32 845 `mmap` and 40 115 `munmap` calls and now makes 8 946 and 17 843 (the rest are managed-heap mappings of strings over 64 KiB), and runs in 1.2 s instead of 1.7 s; building arrays of 2 000 elements alone went from 20 109 `mmap` calls to 413, `JSON.stringify` of 2 000 objects with 300-element arrays from 4 071 to 160. `tests/stability.test.ts` uses the Windows sizes on Linux ([#37](https://github.com/40oleg/nona/issues/37)).
- Made `Array.prototype.shift` and `splice` move the elements of a dense array in one step instead of a Get, Set and HasProperty per element; shifting 20,000 elements one by one went from 6.6 s to 70 ms, and 10,000 middle deletions from 3.5 s to 0.2 s ([#13](https://github.com/40oleg/nona/issues/13)).
- Delete an own property of an object with a property hash index without walking its list: the index records the word that links each node, so deleting the oldest keys first is no longer quadratic (20,000 keys deleted oldest first: 2 s → 22 ms) ([#13](https://github.com/40oleg/nona/issues/13)).

### Calls and generated code

- Every compiled function starts with a 12-byte call of the shared prologue stub `rt.enterFrame` (stack check, frame, argument copies, root record from a static descriptor) instead of an inline prologue of about 275 bytes, and the safepoint at the start of a block tests one flag the allocator raises (`cmp byte [rt.gcNeeded],0`, 14 bytes instead of 38). lodash.js: user code 1 427 KB → 1 156 KB, runtime preludes 4 170 KB → 3 579 KB, executable 11.2 MB → 10.3 MB; a call costs about 16 more instructions in the stub's loops ([#167](https://github.com/40oleg/nona/issues/167)).
- Stack maps replace the clearing of dead frame slots: every function carries a table (`.rdata`) that lists, for the return address of each call it makes, which frame locations are live, and the collector scans only those (plus `this`, `new.target` and the super receiver). The stores of zeros before every operation that reached the runtime are gone; only a destination that was dead before its operation gets a one-byte tag reset. lodash.js: user code 1 156 KB → 1 019 KB, runtime preludes 3 579 KB → 3 048 KB, 517 KB of tables; executable 10.3 MB → 10.2 MB, a call executes 4–5 % fewer instructions ([#165](https://github.com/40oleg/nona/issues/165)).
- Creating a closure and making a general call are one static descriptor (`.rdata`) and one stub call each: `rt.newClosure` reads the captures, flags, name, length, source text and home object from the descriptor and the creating frame, and `rt.invokeSite`/`rt.constructSite`/`rt.tailCallSite` copy the arguments and call `rt.invoke` with the callee, receiver and new.target the descriptor names. A function literal takes 20 bytes of code instead of 87–197 and a general call 20 instead of about 85 (plus a 44 + 4·captures or 24 + 4·arguments byte descriptor); lodash's compiled code is 21 % smaller (1.02 MB → 0.80 MB, runtime preludes 3.05 MB → 2.49 MB) ([#166](https://github.com/40oleg/nona/issues/166)).
- Calls and `new` cost less: `rt.invoke` runs an ordinary function or arrow from a small frame of its own instead of the general path (bound functions, generators, class constructors, proxies and receivers that need boxing still take it), `rt.invokeConstruct` calls a compiled constructor directly, and a `new` site remembers the constructor's `prototype` property so that the instance is created without a lookup. A function's prologue clears only its parameters and the slots live at its entry, and small functions with up to four parameters copy them without a loop; `readCell`, `writeCell` and the constructor result are inline and moves into dead slots are dropped. `bench/14_calls.js` and `bench/15_classes.js` (scale 0.1, Linux x64): direct calls 71.8 → 60.4 ms, closures 117.5 → 108.9 ms, `call`/`apply` 96.6 → 89.9 ms, monomorphic methods 56.4 → 45.7 ms, polymorphic methods 83.4 → 65.1 ms, `new` 56.8 → 45.0 ms ([#47](https://github.com/40oleg/nona/issues/47)).
- The IR optimizer folds constants: unary and binary operations on known primitives (`24 * 60 * 60`, `-1`, `'a' + 1`, `typeof 'x'`, comparisons) become constants, a binding that holds the same primitive on every path to a use is propagated into it, a branch on a known condition becomes a jump and the blocks it no longer reaches are removed, and pure operations whose result is unused (`!`, `typeof`, strict equality, Number arithmetic) are dropped. Folding uses the exact JavaScript operators and leaves out anything whose result could depend on the engine (BigInt, fractional `**`, Number-to-String of fractions). The passes are listed in `docs/architecture.md` ([#146](https://github.com/40oleg/nona/issues/146)).
- Conditions cost less: a branch on `!x` (or `!!x`) tests `x` directly, `if (a || b)`, `if (a && b)` and `??` no longer test the materialized result a second time, empty blocks are skipped, straight-line blocks are merged, and the code generator leaves out jumps to the block that follows. lodash.js lowers to 16% fewer blocks and its generated code has 71% fewer unconditional jumps ([#146](https://github.com/40oleg/nona/issues/146)).
- More arithmetic runs inline on Numbers: after `if (typeof x !== 'number') return` the code that follows treats `x` as a Number, and results of operators that can only produce a Number (or throw) — `+x`, `x >>> 0`, `x | 0`, `x - 1`, `x * 2`, `x % n` — count as Numbers, so the operations that use them need no tag checks and no runtime fallback ([#146](https://github.com/40oleg/nona/issues/146)).
- `x === null`, `x === undefined`, `x !== true`, `x === 0` and `switch` cases with `undefined`, `null`, Boolean or Number constants compare inline (a tag test, plus a floating-point compare for Numbers, so `NaN` matches nothing and `-0` matches `0`) instead of calling `rt.strictEquals` ([#146](https://github.com/40oleg/nona/issues/146)).

### Strings, JSON, Promise and Buffer

- String concatenation in a loop is no longer quadratic: a long `+` result is a rope (a record pointing at both halves) that is copied into a flat string only when something reads its characters. The code generator keeps ropes inside compiled code (frame slots, script-level variables, further `+`, `typeof`, `!` and `.length`) and flattens them before any other use, so the runtime and the host always see flat strings. `s += 'abc' + i` 200 000 times takes 80 ms instead of 37 s (Node.js: 33 ms); 20 000 times 5 ms instead of 850 ms ([#46](https://github.com/40oleg/nona/issues/46), [#83](https://github.com/40oleg/nona/issues/83)).
- A global `RegExp` replace and `String.prototype.replaceAll` join their result once instead of appending to one string, which was quadratic in the number of matches: 20 000 matches of `/ /g` take 0.2 s instead of 3.6 s ([#196](https://github.com/40oleg/nona/issues/196)).
- `JSON.stringify` serializes plain data without the generic property API: a shaped object's keys come off its shape chain and its values off its slots, a dense array's elements off the element table, and whether an object has a `toJSON` is cached on its shape. Serializing no longer turns shaped objects into dictionaries (every later property access on them was slower). 30 000 objects (2.9 MB) take 30 ms instead of 72 ms (Node.js: 17 ms); a small object takes 0.44 µs instead of 0.68 µs. Nesting past the stack budget is a `RangeError`, as in a JS function, instead of a crash ([#45](https://github.com/40oleg/nona/issues/45)).
- `Buffer.from(string)` and `Buffer.byteLength(string)` in UTF-8 call the native encoder directly: one call measures, one writes the new buffer. They no longer go through `TextEncoder.prototype.encode` (receiver check, argument conversion, an argument array for `Reflect.apply`), and `byteLength` no longer encodes the whole string just to count it. For a 95-character JSON text, `Buffer.from` takes 0.89 µs instead of 1.93 µs and `Buffer.byteLength` 0.28 µs instead of 2.5 µs. An HTTP handler answering `res.end(Buffer.from(JSON.stringify(user)))` serves 22 400 instead of 19 900 requests per second. A UTF-8 byte mode of `JSON.stringify` itself is not added: for `res.end(JSON.stringify(user))` the string-to-bytes step it would remove costs about 0.3 µs of a 38 µs request ([#155](https://github.com/40oleg/nona/issues/155)).
- Promise reactions cost a third of what they did: `.then` creates one reaction record holding both handlers and the derived promise instead of a capability, two resolving closures and two list entries; a reaction job is that record itself, queued in a linked job queue to which a settled promise appends its whole reaction list at once; internal promises (derived promises of `%Promise%`, `await`, async functions and generators, `import()`) are settled directly without resolving functions. A chain of 100 000 `.then` takes 460 ms instead of 1 450 ms and 100 000 `await`s 230 ms instead of 1 070 ms; job order is unchanged. A capability `resolve` that throws now reports the error instead of calling `reject` (NewPromiseReactionJob) ([#44](https://github.com/40oleg/nona/issues/44)).
- Promise reactions and `await` take fewer generic steps. The Promise prelude's records are object literals with static shapes instead of constructor calls. `then` builds the derived promise and its reaction inline, reads `Symbol.species` and the async-context tracker from locals (an absent property of the prelude object was a scan of its whole property list per reaction), and fulfils a derived promise with a primitive without a call. `await` of a primitive queues its reaction directly instead of creating a hidden promise. `typeof x === 'name'` (also `!==`, `==`, `!=`) compiles to a test of the value's tag instead of a type-name string and a string comparison. A 20 000-reaction chain executes 210 M instructions instead of 376 M. 100 000 sequential `await`s take 142 ms instead of 450 ms, a chain of 100 000 `.then` 575 ms instead of 739 ms and 100 000 `new Promise` with `Promise.all` 1 097 ms instead of 1 368 ms (best of 3) ([#44](https://github.com/40oleg/nona/issues/44)).

### Language and runtime

- `console.error`, `console.warn`, `console.info` and `console.debug` exist: `error` and `warn` write to standard error, `info` and `debug` to standard output, formatted like `console.log`. The global `console` had only `log`, so `console.error(...)` threw a TypeError and the program ended with `Nona runtime error`. The console methods are enumerable, as in Node.js ([#230](https://github.com/40oleg/nona/issues/230)).
- `x.eval(literal)` where `x.eval` is another realm's `%eval%` (Test262 `$262.createRealm().global.eval('(class {})')`) compiles the source ahead of time as that realm's global code, through the realm-local makers of #7: classes, generators, proxies and errors it creates belong to that realm. `GeneratorFunction`, `AsyncFunction`, `AsyncGeneratorFunction` and `AggregateError` constructed with a `newTarget` whose `prototype` is not an object take the intrinsic prototype of `newTarget`'s realm ([#176](https://github.com/40oleg/nona/issues/176)).
- The `TypeError` of a derived constructor that returns a non-object and the `ReferenceError` of one that never calls `super()` are thrown in the realm of the code that constructs, as ECMA-262 does after the constructor's context is popped (the constructor returns a marker that the calling runtime's construct path turns into the error). `Reflect.construct(C, [literals], newTarget)` with `C` a variable holding a dynamic function constructor (`var C = other.eval('(function* () {})').constructor`) creates the function ahead of time in `C`'s realm. `Function(...)`, nested indirect `eval` and `x.eval`/`x.Function` with literal source inside another realm's eval code are compiled into that realm's maker and run there. Calling an async function or async generator of another realm starts it through that realm's Promise prelude, so its promise is that realm's and the `next()` promises of such an async generator settle (they never did) ([#176](https://github.com/40oleg/nona/issues/176)).
- `Reflect.construct(F, [literals], newTarget)` with `F` written as `Function` or `x.Function` compiles the source ahead of time, creates the function in `F`'s realm and gives it the prototype `newTarget` selects ([#7](https://github.com/40oleg/nona/issues/7)).
- A sloppy-mode function called with an undefined or null `this` gets the global object of its own realm, not the caller's (OrdinaryCallBindThis) ([#7](https://github.com/40oleg/nona/issues/7)).
- `x.Function(...)` and `new x.Function(...)` with literal source text compile ahead of time like `Function(...)`; when `x.Function` is another realm's `Function`, the function is created in that realm, with its global object, intrinsics and errors ([#7](https://github.com/40oleg/nona/issues/7)).
- Fixed collections in programs with several realms: every realm's runtime now shares the allocator, lazy sweep, weak collection list and the caches the collector invalidates, so objects created by another realm's code are marked and swept with the rest of the heap instead of being freed while still referenced ([#7](https://github.com/40oleg/nona/issues/7)).
- `Promise` instances constructed with a `newTarget` whose `prototype` is not an object get `%Promise.prototype%` of `newTarget`'s realm instead of `%Object.prototype%` ([#7](https://github.com/40oleg/nona/issues/7)).
- `new Function()` and `Reflect.construct(Function, [], newTarget)` take their prototype from `newTarget` (GetPrototypeFromConstructor), falling back to `%Function.prototype%` of `newTarget`'s realm ([#7](https://github.com/40oleg/nona/issues/7)).
- Programs with extra realms share the tail-call staging area, the coroutine stack pool and its byte count, the stack limit and the fatal-exit state between realms. Generators and strict tail calls created by another realm's `Function` crashed under GC stress because the collector and the shared JS code used only the main realm's copies; a new test checks that no code shared by all realms refers to a realm's own runtime data ([#198](https://github.com/40oleg/nona/issues/198)).
- `Function` calls with literal source are compiled ahead of time also in programs where some function declares its own `Function`: only the calls inside that function are left as written. lodash's top-level `Function('return this')()` threw EvalError because its `runInContext` declares `var Function` ([#196](https://github.com/40oleg/nona/issues/196)).
- Functions with more than 256 locals (a bundle's top-level scope wrapped in one function, such as typescript.js) treat their locals as live everywhere: liveness, frame slot assignment, the dead-zone check and Number inference no longer grow with locals × operations. A function with 4000 captured locals compiles in 3 s and 239 MB instead of 39 s and 5.2 GB, and typescript.js (9 MB) compiles in 95 s instead of running out of memory ([#162](https://github.com/40oleg/nona/issues/162)).
- Function source text (for `Function.prototype.toString`) is stored once per module, one byte per character when it fits, and each function keeps only its range; the string is created when `toString` is called. Nested functions no longer repeat their enclosing function's text: the Angular builder with typescript.js shrinks from 146 MB to 87 MB ([#164](https://github.com/40oleg/nona/issues/164)).

### Compiler and tooling

- `nona build --print-asm` prints the x86-64 assembly generated for the program's own functions (not the runtime or its preludes): per function its label, then each instruction with its offset, encoded bytes and Intel-syntax text. `-o` is optional with it; the compile API option is `printAsm` and the text is returned as `assembly`. Assemblers record nothing unless the listing is on ([#145](https://github.com/40oleg/nona/issues/145)).
- A failed compiler invariant (a bug in Nona) is reported as an `E_INTERNAL` diagnostic positioned in the source and naming the phase (`parse`, `bind`, `lower`, `codegen`, `link`, …) instead of a bare `nona: Missing binding: x`; the native compiler reports it the same way, without the phase wrappers the self-hosting bootstrap used to patch in. Diagnostic codes are a closed `DiagnosticCode` type and all of them are listed in the CLI reference ([#177](https://github.com/40oleg/nona/issues/177)).
- Layer direction of the compiler sources: the lexer no longer imports the runtime (`compiler.ts` installs the RegExp literal validator, `src/regexp-validator.ts`), the optional-runtime link table moved to `src/link.ts`, the `node:events` algorithms used by the runtime prelude to `src/runtime/events-module-source.ts`, and the Date, Map and ArrayBuffer layouts to `*-layout.ts` files, which removes the three import cycles of `src/runtime`. `tests/module-boundaries.test.ts` checks the direction and that value imports have no cycles; the self-hosting bootstrap no longer edits the lexer and fails when one of its remaining source edits finds nothing to replace ([#168](https://github.com/40oleg/nona/issues/168)).
- The machine model is one layer: the fragment, fixup and program model shared by the PE, ELF and Mach-O writers moved from `src/backend/pe/model.ts` to `src/backend/machine/model.ts`, the runtime imports the assembler only through `src/backend/machine/context.ts`, and the x87 and ARM64 variants of the `Math` transcendental steps sit behind a `MachineMath` interface chosen there (`backend/x64/x87-math.ts`, `runtime/numeric/software-math.ts`) instead of inline branches in `runtime/math.ts`. `tests/module-boundaries.test.ts` checks that the runtime reaches the backend only through `backend/machine/*`. Generated executables are unchanged ([#178](https://github.com/40oleg/nona/issues/178)).
- The JavaScript compiled into every executable — the runtime preludes (RegExp engine, Promise, Proxy, Reflect, timers, Buffer, `process`, streams, …) and the bodies of the `node:fs`, `node:http`, `node:net`, `node:path`, `node:stream`, `node:events` and other built-in modules — moved from `String.raw` template literals in `src/runtime/*-source.ts` and `src/frontend/*-module.ts` into 56 real `.js` files under `src/lib/runtime/` and `src/lib/modules/` (about 8,700 lines). `scripts/build.mjs` generates `src/lib/sources.generated.ts` from them before `tsc` runs and copies them to `dist/src/lib/`; a file with `${…}` substitutions becomes a template object that its TypeScript module fills in place with `String.raw`. The prelude text the compiler lexes and the generated executables are byte-identical; `tests/lib-sources.test.ts` checks the generated constants and that no large prelude stays inline ([#170](https://github.com/40oleg/nona/issues/170)).
- The two largest compiler files are split without changing generated code. `src/backend/x64/codegen.ts` (88 KB) keeps the image assembly; the per-function x86-64 emission moved to `operations.ts`, the prelude selection and lowering to `preludes.ts` and the base-image cache to `base-image.ts`. The `Lowerer` of `src/ir/lower.ts` (110 KB) is a class chain: `lower/base.ts` (function state, bindings, scopes, references), `classes.ts`, `calls.ts` (calls, tail calls, FFI, optional chains), `patterns.ts`, `control.ts` (statements and completions), and `lower.ts` (expressions and entry points). `tests/source-budget.test.ts` keeps source files below 60 KiB and lines below 200 characters, with an allow-list of the existing exceptions that may only shrink. The self-hosting bootstrap patches the prelude cache in its new place ([#169](https://github.com/40oleg/nona/issues/169)).

### Examples

- Added `examples/angular`: a builder for standard Angular applications that Nona compiles, with the TypeScript compiler, into a native executable; it builds `ng new` into a page that renders like the `ng build` output ([#156](https://github.com/40oleg/nona/issues/156)).
- `examples/lodash`: lodash 4.17.21 and its own test suite compiled by Nona. Everything passes except `_.template`, which compiles code at run time ([#196](https://github.com/40oleg/nona/issues/196)).

### CI, tests and documentation

- CI jobs run test suites named in `tests/suites.json` (`node scripts/run-suite.mjs <suite...>`) instead of hand-maintained file lists in the workflows; every test file belongs to exactly one suite, which `tests/suites.test.ts` checks ([#173](https://github.com/40oleg/nona/issues/173)).
- A `v<version>` tag publishes a GitHub release with the eight native compiler archives (`.github/workflows/release.yml`, see `docs/self-hosting.md`); a manual run builds them as a dry run. The eight Windows Test262 directory jobs of `check.yml` are one matrix, and the Node.js version and Test262 revision are set once per workflow ([#179](https://github.com/40oleg/nona/issues/179)).
- Skip nodejs.org API documentation links in the pages link check: nodejs.org currently answers 404 for its HTML API pages, which failed the check on every branch ([#190](https://github.com/40oleg/nona/issues/190)).
- Moved the 15 probe program sources (platform, process, stream, event, arm64 and self-host probes) from `src/` to `tests/probes/`, so they no longer ship in `dist/src` or in the self-host source tree ([#175](https://github.com/40oleg/nona/issues/175)).
- Re-measured the v0.7.0 micro-benchmark tables for v0.10.0 against Node.js in `PERFORMANCE.md` (Map/Set, sort, Promise and JSON are no longer quadratic; string concatenation and RegExp are the largest remaining gaps), marked the old tables as superseded and documented the measurement protocol in `bench/README.md` ([#180](https://github.com/40oleg/nona/issues/180)).
- Added `docs/architecture.md` (pipeline, layouts, calling convention, machine model, runtime linking) with a test that checks its layout tables against the source, corrected stale statements in `runtime-memory.md`, `es2020-contract.md` and `language-support.md`, and made `docs/README.md` a complete English index ([#171](https://github.com/40oleg/nona/issues/171)).
- Moved per-release status files, deferred Test262 lists, plans, the development log and agent session notes from `docs/` to `docs/history/`; the current status is `docs/status.md`, rewritten per release ([#172](https://github.com/40oleg/nona/issues/172)).
- Add a Lean 4 proof prototype for slot substitution, dead writes, destination coalescing and a modeled straight-line dead-move optimizer, with checked counterexamples, axiom auditing, production IR regressions and proof CI ([#160](https://github.com/40oleg/nona/issues/160)).
- Rewrote the English and Russian READMEs: why Nona, installation from the release builds, a quick start, the supported Node.js APIs as a table, HTTP performance figures, and current development notes ([#153](https://github.com/40oleg/nona/issues/153)).

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
