# Nona

**Nona is an experimental ahead-of-time compiler that turns a supported subset of JavaScript into standalone Windows or Linux x64 executables.**

[Русская версия](README.ru.md) · [Language support](docs/language-support.md) · [Runtime memory model](docs/runtime-memory.md)

Nona parses JavaScript, lowers it to its own intermediate representation, emits x86-64 machine code, and writes PE32+ or ELF64 executables. The generated program does not embed Node.js or a JavaScript interpreter and does not require a C/C++ compiler or LLVM. Windows output uses `KERNEL32.dll`; Linux output uses direct syscalls.

> **Project status:** `v0.6.0` adds Date/JSON, BigInt, RegExp, binary memory, collections, Proxy/Reflect, Promise and async language support, modules, and related ES2020 work on Windows and Linux x64. ES2020 remains incomplete; arbitrary JavaScript and Node.js projects are not supported. See the [v0.6 status](docs/v0.6-status.md) for verification and remaining limitations.

## How it works

```text
JavaScript source
      │
      ▼
 lexer → parser → scope binding → IR lowering
                                      │
                                      ▼
                            x86-64 code generation
                                      │
                                      ▼
                         runtime + PE32+ linker → .exe
```

The compiler itself is written in TypeScript and runs on Node.js. The resulting `.exe` contains native code for the program plus Nona's runtime for JavaScript values, objects, functions, exceptions, strings, and garbage collection.

## Requirements

- Windows 10 or 11, x64
- Node.js 26 or newer
- npm

The project was verified on Windows 11 x64 with Node.js 26.9.0, npm 11.19.1, and TypeScript 7.0.2. Dependencies are pinned in `package-lock.json`.

## Build Nona

Clone the repository and install the development dependencies:

```powershell
git clone https://github.com/40oleg/nona.git
cd nona
npm.cmd ci
npm.cmd run build
```

The compiler entry point is generated at `dist/cli.js`.

## Compile a JavaScript program

Create `hello.js`:

```js
function greet(name) {
  return "Hello, " + name + "!";
}

console.log(greet("from Nona"));
```

Compile and run it:

```powershell
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

Output:

```text
Hello, from Nona!
```

The CLI accepts one UTF-8 source file:

```text
nona build <input.js> -o <output> [--target win32-x64|linux-x64]
nona --help
nona --version
```

`-o` is required. `win32-x64` is currently the only target.

## Included examples

```powershell
node dist/cli.js build examples/factorial.js -o build/factorial.exe
.\build\factorial.exe

node dist/cli.js build examples/modern-expressions-demo.js -o build/modern-expressions-demo.exe
.\build\modern-expressions-demo.exe
```

The `examples` directory also contains Fibonacci, loop, string, compatibility, and matrix-calculator programs.

## Current language support

The implemented subset includes:

- numbers, UTF-16 strings, booleans, `null`, `undefined`, Symbols, arrays, and objects;
- arithmetic, comparison, logical, bitwise, assignment, exponentiation, and nullish-coalescing operators;
- optional chaining for properties, computed properties, calls, methods, and `delete`;
- `if`, `switch`, `while`, `do/while`, traditional `for`, `for...in`, `for...of`, labels, `break`, and `continue`;
- `var`, `let`, and `const`, including hoisting, block scope, TDZ, and per-iteration bindings;
- ordinary and arrow functions, rest parameters, function expressions, recursion, closures, `this`, `arguments`, `new`, `new.target`, and `super` property access in object methods;
- template literals, tagged templates, and the basic iterator protocol for arrays, strings, and custom iterables;
- selected UTF-16 string methods, including `indexOf`, `lastIndexOf`, `padStart`, `padEnd`, and `String.fromCharCode`;
- selected array methods, including `includes`, `indexOf`, `lastIndexOf`, `forEach`, `some`, `every`, `find`, `findIndex`, `reduce`, `reduceRight`, `fill`, `copyWithin`, `reverse`, `shift`, and `unshift`;
- `call`, `apply`, `bind`, function metadata, and function source text;
- property descriptors, accessors, prototype chains, object integrity operations, and selected `Object` APIs;
- strict mode, exceptions, the standard Error family, and `try/catch/finally`;
- a precise non-moving mark-and-sweep garbage collector;
- basic `console.log` output through Windows system calls.
- a global `process` object with `argv`, `env`, `exit`, `exitCode`, `execPath` and `cwd` (see [process](docs/process.md)).
- synchronous file system access through `node:fs`/`nona:fs`, and `TextEncoder`/`TextDecoder` (see [file system](docs/fs.md)).
- calls to exported DLL functions on Windows through `nona:ffi` and `nona:win32` (see [FFI](docs/ffi.md)).

See the [language support matrix](docs/language-support.md) for exact behavior and test coverage.

## Known limitations

Nona targets ES2020 with documented exceptions; it is not yet a complete implementation. The branch for the ES2020 gate adds async functions and generators, modules with `import()`, `with`, proper tail calls, realms and agents for Test262, and Annex B web-compatibility semantics; see [the ES2020 work list](docs/pr5-es2020-remaining-work.md) for pinned Test262 results and the remaining failures. Current limitations:

- `eval` and dynamic function constructors with runtime-computed source text are excluded by design (`Function`, `GeneratorFunction` and `AsyncFunction` calls with literal source are compiled ahead of time);
- APIs added after ES2020 (for example class fields, `Promise.any`, `WeakRef`), browser APIs and Node.js APIs;
- a few cross-realm constructor fallbacks, legacy RegExp syntax from Annex B.1.4, and the performance of very large arrays;
- targets other than Windows and Linux x64.

Unsupported syntax is rejected by the compiler. Consult the support matrix before relying on a language feature.

## Development

Build and run the full test suite:

```powershell
npm.cmd run check
```

Compare the bundled compatibility programs with Node.js:

```powershell
npm.cmd run compare
```

The tests compile and execute real Windows PE files and cover the frontend, IR, x64 encoder, PE writer, runtime, CLI, standalone execution, and garbage collector.

Project layout:

```text
src/frontend       lexer, parser, declarations, and scope binding
src/ir             intermediate representation, lowering, and liveness
src/backend/x64    x86-64 instruction encoding and code generation
src/backend/pe     PE32+ image, imports, relocations, and unwind metadata
src/runtime        native JavaScript runtime emitted into each executable
tests              unit, integration, native-execution, and compatibility tests
examples           programs that can be compiled with Nona
```

## Security and compatibility

Nona is an experimental compiler and has not received a security audit. Do not compile untrusted source code or treat generated executables as a sandbox. A generated program has the same operating-system permissions as any other native executable.

Nona does not claim complete ES5, ES2015, or ES2020 conformance. Compatibility claims apply only to the features and cases documented in the support matrix.

## License

Nona is available under the [MIT License](LICENSE). Third-party notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
