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

| Area | Nona | Node.js |
| --- | --- | --- |
| `process.argv` | `[execPath, ...arguments]`: `argv[1]` is the first argument | `[node, script, ...arguments]` |
| `process` | `argv`, `argv0`, `execArgv`, `env`, `exit`, `exitCode`, `execPath`, `cwd`, `chdir`, `platform`, `arch`, `pid`, `ppid`, `nextTick`, `hrtime`, `uptime` (all eight targets) | EventEmitter, streams, signals, IPC and resource reports |
| Timer ids | Numbers | `Timeout` objects |
| `readFileSync(path)` | Returns a `Uint8Array` | Returns a `Buffer` |
| Encodings | `utf8` only | Many |
| Error messages on Windows | Contain the path as given | Contain the absolute path |
| Modules | `nona:*`, `node:fs`, `node:process` and relative files | Everything in `node:*` and npm packages |
| `require`, `Buffer`, `node:path` | Not available | Available |
| `console.log` without standard output | Output is dropped | Output is dropped or an error is raised |

## Performance

- Arrays and `Map`/`Set` keep their elements in linked structures; very large collections are slower than in V8 ([#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36)).
- The RegExp engine is a backtracking VM written in JavaScript. A pattern without backreferences or lookarounds that backtracks excessively (outside the `u` flag) is finished by a linear-time engine instead.
- On Windows timers wake up on the system tick (typically 15.6 ms).
- There is no JIT: code is compiled once, ahead of time, without profile-guided optimisation.

## Linked runtime parts

Every executable contains the runtime, but its large optional parts are linked only when the program can reach them. The compiler decides from the text of every source it compiles — the program, its modules and compile-time `eval`/`Function` sources:

| Part | Size | Linked when a source contains |
| --- | --- | --- |
| RegExp engine | about 1 MB | a RegExp literal, or the name `RegExp`, `match`, `matchAll` or `search` (as an identifier, a property name or inside a string or template literal) |
| Unicode property tables for `\p{…}`/`\P{…}` | about 2 MB | `\p{` or `\P{` in a RegExp literal or a string, or one of the names above (a pattern may be built at run time) |
| Unicode normalization tables | about 0.7 MB | the name `normalize` or `localeCompare` |

`split`, `replace` and `replaceAll` with string arguments do not need the RegExp engine.

Built-in libraries written in JavaScript that only install globals or methods (about 0.7 MB together) are linked the same way, when a source contains one of their names:

| Part | Names |
| --- | --- |
| `Proxy` | `Proxy` |
| `TextEncoder`, `TextDecoder` | `TextEncoder`, `TextDecoder` (also linked with `process`) |
| `process` | `process` |
| Timers, the event loop, `queueMicrotask` and `performance` | `setTimeout`, `setInterval`, `setImmediate`, `clearTimeout`, `clearInterval`, `clearImmediate`, `queueMicrotask`, `performance`, `globalThis` |
| `.at()`, `findLast`, `findLastIndex`, `Object.hasOwn`, `AggregateError`, `Promise.any` | `at`, `findLast`, `findLastIndex`, `hasOwn`, `AggregateError`, `any`, `unscopables` |
| Annex B `escape`, `unescape`, `substr`, `setYear`, `toGMTString`, `RegExp.prototype.compile` and the HTML methods of strings (`anchor`, `big`, `link`, …) | the same names |
| Stable merge `Array.prototype.sort` | `sort` |
| `Object.freeze`, `seal`, `isFrozen`, `isSealed` through Proxy traps (otherwise native versions for ordinary objects) | the same names |
| `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__` | the same names |

A program that calls `Object.getOwnPropertyNames`, `Object.getOwnPropertyDescriptors` or `Reflect.ownKeys` links all of them, since it could list the built-ins ([#84](https://github.com/40oleg/nona/issues/84)). A hello world is about 2.2 MB; with every part it is 7 MB.

A program can still reach an omitted part through a name computed at run time, for example `globalThis['Reg' + 'Exp']`. For the RegExp engine and the Unicode tables such a call throws an `Error` whose message names the missing part; an omitted global or method is simply absent. Compile with `--full-runtime` (or the `fullRuntime` option of [`compile()`](/reference/api)) to link everything ([#62](https://github.com/40oleg/nona/issues/62)).

## Realms

`$262.createRealm` is supported for Test262. Some constructors implemented in JavaScript preludes still take default prototypes from the wrong realm when called with `new.target` from another realm ([#7](https://github.com/40oleg/nona/issues/7)).

## Platforms

- Process APIs are available on all eight targets; filesystem APIs require Windows or Linux.
- Windows executables use OS DLLs (including NTDLL for parent process metadata) and declared FFI imports; POSIX executables use native OS services.
- FFI DLL calls require Windows; raw system calls use the selected Linux, Darwin or BSD kernel.

## Native platforms

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Native platforms](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
