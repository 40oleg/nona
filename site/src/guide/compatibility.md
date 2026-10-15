# Compatibility and limitations

## Scope

Nona targets the normative ECMA-262 11th edition (June 2020) language and built-ins, for scripts and ES modules. ECMA-402 internationalization, browser APIs and Node.js APIs are separate specifications; Nona provides only the host APIs listed in the [Reference](/reference/modules). The completion contract is kept in [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md).

A release is described as "ES2020 with documented exceptions", never as fully conformant ES2020.

## `eval` and `Function`

Nona compiles ahead of time, so `eval` and the dynamic function constructors need their source text at compile time:

- **Compiled ahead of time:** a string literal, a concatenation of literals, or a variable that is only ever assigned such constants (the value is compared at run time). Direct `eval` sees the caller's scope, `this`, `arguments`, `new.target` and `super`; indirect forms (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) run in the global scope. `Function`, `GeneratorFunction`, `AsyncFunction` and `AsyncGeneratorFunction` calls whose arguments are all literals are compiled with CreateDynamicFunction semantics.
- **Not supported:** source computed at run time, spread arguments to `eval` and `$262.evalScript`. These throw:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

Run-time sources are tracked in [#11](https://github.com/40oleg/nona/issues/11).

## Differences from Node.js

| Area                                  | Nona                                                                                                                                                | Node.js                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `process.argv`                        | `[execPath, ...arguments]`: `argv[1]` is the first argument                                                                                         | `[node, script, ...arguments]`                                                 |
| `process`                             | Common metadata, environment mutation, clocks/ticks, standard I/O, lifecycle/warnings, CPU/resources and native process control (all eight targets) | Signal handlers, IPC, V8 heap reports, full async streams and terminal control |
| Timer ids                             | Numbers                                                                                                                                             | `Timeout` objects                                                              |
| `readFileSync(path)`                  | Returns a `Uint8Array` (without an encoding)                                                                                                        | Returns a `Buffer`                                                             |
| Encodings                             | `utf8` (fs); UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer) only                                                                   | Many                                                                           |
| Error messages on Windows             | Contain the path as given                                                                                                                           | Contain the absolute path                                                      |
| Modules                               | `nona:*`, the `node:*` modules listed in [Built-in modules](/reference/modules), files and npm packages resolved at build time                      | Everything in `node:*` and npm packages, resolved at run time                  |
| `require`                             | CommonJS modules, with literal specifiers known at build time ([npm packages](/reference/npm))                                                      | Any specifier at run time                                                      |
| `console.log` without standard output | Output is dropped                                                                                                                                   | Output is dropped or an error is raised                                        |

## Performance

- Arrays, objects and `Map`/`Set` use dense and hashed storage with shapes and inline caches, but calls, closures and allocation still run several times slower than in V8; [Performance](/guide/performance) lists the slow spots.
- The RegExp engine is a backtracking VM written in JavaScript. A pattern without backreferences or lookarounds that backtracks excessively (outside the `u` flag) is finished by a linear-time engine instead.
- On Windows timers wake up on the system tick (typically 15.6 ms).
- There is no JIT: code is compiled once, ahead of time, without profile-guided optimisation.

## Linked runtime parts

Every executable contains the runtime, but its large optional parts are linked only when the program can reach them. The compiler decides from the text of every source it compiles — the program, its modules and compile-time `eval`/`Function` sources:

| Part                                        | Size         | Linked when a source contains                                                                                                                      |
| ------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| RegExp engine                               | about 1 MB   | a RegExp literal, or the name `RegExp`, `match`, `matchAll` or `search` (as an identifier, a property name or inside a string or template literal) |
| Unicode property tables for `\p{…}`/`\P{…}` | about 2 MB   | `\p{` or `\P{` in a RegExp literal or a string, or one of the names above (a pattern may be built at run time)                                     |
| Unicode normalization tables                | about 0.7 MB | the name `normalize` or `localeCompare`                                                                                                            |

`split`, `replace` and `replaceAll` with string arguments do not need the RegExp engine.

Built-in libraries written in JavaScript that only install globals or methods (about 0.7 MB together) are linked the same way, when a source contains one of their names:

| Part                                                                                                                                                      | Names                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Proxy`                                                                                                                                                   | `Proxy`                                                                                                                                       |
| `TextEncoder`, `TextDecoder`                                                                                                                              | `TextEncoder`, `TextDecoder` (also linked with `process`)                                                                                     |
| `process`                                                                                                                                                 | `process`                                                                                                                                     |
| Timers, the event loop, `queueMicrotask` and `performance`                                                                                                | `setTimeout`, `setInterval`, `setImmediate`, `clearTimeout`, `clearInterval`, `clearImmediate`, `queueMicrotask`, `performance`, `globalThis` |
| `.at()`, `findLast`, `findLastIndex`, `Object.hasOwn`, `AggregateError`, `Promise.any`, `toSorted`, `toReversed`, `toSpliced`, `with`                     | `at`, `findLast`, `findLastIndex`, `hasOwn`, `AggregateError`, `any`, `unscopables`                                                           |
| Annex B `escape`, `unescape`, `substr`, `setYear`, `toGMTString`, `RegExp.prototype.compile` and the HTML methods of strings (`anchor`, `big`, `link`, …) | the same names                                                                                                                                |
| Stable merge `Array.prototype.sort`                                                                                                                       | `sort`                                                                                                                                        |
| `Object.freeze`, `seal`, `isFrozen`, `isSealed` through Proxy traps (otherwise native versions for ordinary objects)                                      | the same names                                                                                                                                |
| `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`                                                                            | the same names                                                                                                                                |
| Binary data methods of `ArrayBuffer`, `SharedArrayBuffer`, `DataView` and the typed arrays (`slice`, `subarray`, `sort`, …)                               | their constructor names, `Atomics`, `TypedArray` (also linked with `process`, `Buffer` and `TextEncoder`)                                     |
| RegExp and String protocol methods (`Symbol.replace`, `String.prototype.match`, `matchAll`, `search`, `replaceAll`, …)                                    | with the RegExp engine, or `replaceAll`                                                                                                       |

A program that calls `Object.getOwnPropertyNames`, `Object.getOwnPropertyDescriptors` or `Reflect.ownKeys` links all of them, since it could list the built-ins ([#84](https://github.com/40oleg/nona/issues/84)). A hello world is about 1.1 MB; with every part it is 7 MB.

Helpers that only some syntax needs are linked when the compiled program calls them, not by name: `with` statements, literal `eval`, class fields and private names, and ES modules with `import()` and `import.meta` ([#278](https://github.com/40oleg/nona/issues/278)).

A program can still reach an omitted part through a name computed at run time, for example `globalThis['Reg' + 'Exp']`. For the RegExp engine and the Unicode tables such a call throws an `Error` whose message names the missing part; an omitted global or method is simply absent. Compile with `--link part,...` to add the parts such a program needs, or with `--full-runtime` (or the `link` and `fullRuntime` options of [`compile()`](/reference/api)) to link everything ([#62](https://github.com/40oleg/nona/issues/62)). `--print-link` lists what was linked and which name selected each part ([#182](https://github.com/40oleg/nona/issues/182)).

## Realms

`$262.createRealm` is supported for Test262. Functions, classes and eval code created with literal source through another realm's `Function`, `eval` or dynamic function constructors run in that realm, and default prototypes and constructor errors come from the realm ECMA-262 names ([#7](https://github.com/40oleg/nona/issues/7), [#176](https://github.com/40oleg/nona/issues/176)).

## Platforms

- `process` and `node:fs` are available on all eight targets; HTTP and TCP (`node:http`, `node:net`) on Windows and Linux.
- Windows executables use OS DLLs (including NTDLL for parent process metadata) and declared FFI imports; POSIX executables use native OS services.
- FFI DLL calls require Windows; raw system calls use the kernel numbers of the selected Linux, Darwin or BSD target. Details: [Native platforms](/reference/native-platforms).

## Buffer

Global `Buffer`, `Blob` and `File`, and `node:buffer` / `buffer` / `nona:buffer` imports are available on every native target. Buffer supports standard byte encodings, shared slices, copying, searching and numeric access. Blob/File support immutable data and metadata. Blob byte/text streams and object URL registration/resolution are available; see [the API contract and limitations](/reference/host-apis#buffer-and-binary-data).
