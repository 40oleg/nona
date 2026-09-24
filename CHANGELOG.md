# Changelog

## v0.1 — 2026-09-24

Initial public development release.

- Compiles the documented JavaScript subset to standalone Windows x64 PE executables.
- Emits x86-64 machine code directly and includes a small native runtime and precise mark-and-sweep garbage collector.
- Supports functions, closures, objects, arrays, descriptors, strict mode, exceptions, exponentiation, nullish coalescing, and optional chaining within the documented limits.
- Includes a command-line compiler, examples, compatibility programs, and native execution tests.

This release is experimental and does not implement complete ECMAScript or Node.js compatibility. See the [language support matrix](docs/language-support.md) for exact coverage.
