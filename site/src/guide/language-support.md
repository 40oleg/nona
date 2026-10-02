# Language support

Nona targets the ECMA-262 11th edition (ES2020) with documented exceptions. This page summarises what is supported as of **v0.7.0**; the numbers come from the pinned Test262 revision described on the [Test262](/reference/test262) page.

**Supported** means implemented and covered by unit tests and Test262 within the limits in the Notes column. The detailed per-feature matrix with test names is kept in [`docs/language-support.md`](https://github.com/40oleg/nona/blob/main/docs/language-support.md) (Russian).

## Language

| Area | Status | Notes |
| --- | --- | --- |
| Lexical grammar and literals | Supported | Decimal, hex, binary, octal and BigInt literals, Unicode escapes in identifiers and strings, template literals. Annex B legacy octal and HTML-like comments in sloppy scripts. Numeric separators (ES2021) are rejected. |
| `var`, `let`, `const`, TDZ | Supported | Hoisting, block scope, per-iteration bindings, declaration conflicts as early errors. |
| Functions | Supported | Declarations and expressions, closures, `arguments` (mapped and unmapped), default and rest parameters, destructuring parameters, `this`, `new.target`, `Function.prototype.toString` with exact source text. |
| Arrow functions | Supported | Lexical `this`, `arguments`, `new.target` and `super`; `async` arrows. |
| Classes | Supported | Declarations and expressions, constructors, instance and static methods and accessors, computed names, inheritance including built-ins and `extends null`, `super()` and `super.x`. Class fields and private names (ES2022) are not supported. |
| Destructuring, spread | Supported | Declarations, assignments, parameters, `for-in`/`for-of` targets; array, object, call and `new` spread. |
| Iterators and generators | Supported | The iterator protocol, `for-of`, generator functions and methods, `yield*`, `return`/`throw`. |
| Async functions | Supported | Async functions, arrows and methods, `await`, async generators and `for await`, with the ES2020 job order. |
| Operators | Supported | Including `**`, optional chaining, `??`, `delete`, `in`, `instanceof` with `Symbol.hasInstance`, BigInt arithmetic and comparisons. |
| Control flow | Supported | All statements, labels, `try`/`catch`/`finally` with completion values, `switch`, `debugger` (no-op). |
| Strict mode | Supported | Directive prologues, strict `this`, early errors and run-time restrictions. |
| `with` | Supported | Sloppy scripts only, with `Symbol.unscopables`. |
| Proper tail calls | Supported | In strict code. |
| Modules | Supported | `import`/`export` in all forms, cycles, live bindings, namespace objects, `import.meta`, `import()` of modules known at compile time. Top-level `await` (ES2022) is not supported. |
| `eval`, `Function` | Partial | Source known at compile time is compiled ahead of time with full direct and indirect `eval` semantics; source computed at run time throws `EvalError`. See [Compatibility](/guide/compatibility#eval-and-function). |
| Annex B | Supported | Web-compatibility semantics for functions in blocks, `__proto__`, legacy RegExp syntax, `escape`/`unescape`, String HTML methods and more. |

## Built-ins

| Area | Status | Notes |
| --- | --- | --- |
| Object, Function, Boolean, Symbol, Error | Supported | Including property descriptors, integrity operations and the global and well-known symbols. |
| Number, Math, URI functions | Supported | Shortest round-trip number formatting, `toFixed`/`toExponential`/`toPrecision`, all ES2020 `Math` functions. |
| String | Supported | ES2020 methods, Unicode normalization, `localeCompare` without ECMA-402 locale data. |
| RegExp | Supported | Named groups, lookbehind, `s`, `u`, `y` and `g` flags, Unicode property escapes, `matchAll`. The engine is a backtracking VM written as a prelude; it is slower than V8. |
| Array | Supported | All ES2020 methods, species, holes and very large lengths. |
| Date, JSON | Supported | Date parsing and formatting in UTC and local time, `JSON.parse` with revivers, `JSON.stringify` with replacers and indentation. |
| Map, Set, WeakMap, WeakSet | Supported | Ephemeron semantics for weak collections. |
| ArrayBuffer, DataView, typed arrays | Supported | All 11 typed array types including BigInt arrays, detachment, species. |
| SharedArrayBuffer, Atomics | Supported | Including `Atomics.wait`/`notify` with worker agents (used by Test262). |
| Proxy, Reflect | Supported | All traps and invariants. |
| Promise | Supported | `all`, `allSettled`, `race`, `finally`, thenables and unhandled rejection reporting. |
| `globalThis`, `console.log` | Supported | `console.log` writes UTF-8 to standard output. |

## Beyond ES2020

Features from later editions are not supported: class fields and private names, static blocks, `Promise.any`, `WeakRef` and `FinalizationRegistry`, logical assignment operators, numeric separators, the RegExp `v` flag, top-level `await` and `Array.prototype.at`. A few later library additions, such as `String.prototype.replaceAll`, are available. Where the pinned Test262 revision already checks newer semantics for ES2020 features, Nona follows Test262; the [Test262](/reference/test262#semantics-newer-than-es2020-in-the-pinned-test262) page lists these cases.

Host APIs that are not part of ECMAScript — timers, `process`, `node:fs`, `TextEncoder`/`TextDecoder` and FFI — are described in the [Reference](/reference/modules).

## Test262 results

Full pinned Test262 run on Windows x64 (features from ES2020 and earlier):

| Directory | Passed / applicable | Remaining failures |
| --- | --- | --- |
| `language/` | 17298 / 17337 | 30 `eval`, 6 newer semantics, 3 other |
| `built-ins/` | 15491 / 15559 | 16 `eval`, 14 newer semantics, 38 other |
| `built-ins/Atomics` (agents) | 268 / 268 | — |
| `annexB/` | 996 / 1016 | 20 `eval` |

"`eval`" failures use source text computed at run time, `$262.evalScript` or other realms; "newer semantics" tests check behaviour from later editions under an old or missing feature tag. The [status page](/guide/status) lists the remaining failures.
