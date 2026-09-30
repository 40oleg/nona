# Changelog

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
