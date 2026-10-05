# Getting started

## Requirements

- To run the compiler: Node.js 26 or newer and npm, on any host running Node.js 26.
- Targets: Windows/Linux/macOS x64 and ARM64, FreeBSD/OpenBSD x64. The default follows the host OS and CPU.

## Build the compiler

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

The compiler entry point is `dist/cli.js`; the examples on this site run it as `node dist/cli.js`. The package also declares a `nona` command: `npm link` in the repository puts it on your `PATH`.

## Your first program

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

The program ends when no timers or Promise jobs are left. The executable runs on its own: copy it to a machine without Node.js and it still works.

## Targets and cross-compilation

The compiler is a cross-compiler: on Windows it can produce Linux executables and on Linux it can produce Windows executables. `--target` selects the output format; the default is `win32-x64`. Linux outputs are written with mode `0755`.

## Modules

A `.mjs` input, or any input compiled with `--module`, is an ES module. Relative imports (`./util.mjs`, `../lib/x.mjs`) are resolved next to the importing file and compiled into the same executable. Built-in modules use the `nona:` prefix (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`), and `node:fs` and `node:process` are aliases of the Nona subsets; see [Built-in modules](/reference/modules).

## A Windows program without a console

```sh
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` starts the program without a console window and embeds a default manifest; `--icon` and `--version-info` add resources that Explorer shows. See [Windows executables](/reference/windows-executables) and the [Museum example](/examples/museum).

## Troubleshooting

Compile errors are printed as `file:line:column CODE: message` and the compiler exits with status 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- Unsupported syntax is rejected at compile time instead of failing at run time.
- `E_FFI_TARGET` means a DLL declaration was compiled for `linux-x64` (or a system call for `win32-x64`).
- `EvalError` at run time means `eval` or `Function` received source text that was not known at compile time.

The [command line reference](/reference/cli) lists every option and error.

## Native platforms

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Native platforms](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
