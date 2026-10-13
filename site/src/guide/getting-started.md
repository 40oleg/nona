# Getting started

## Install

Download the archive for your system from the [latest release](https://github.com/40oleg/nona/releases/latest), extract it and run `nona --help` (`./nona --help` on Linux, macOS and BSD). The archive holds the executable, the license and a version file; the compiler is a native program that needs no Node.js. Each release also lists `SHA256SUMS`.

| OS                          | Archive                                        | Target name                  |
| --------------------------- | ---------------------------------------------- | ---------------------------- |
| Windows x64 / ARM64         | `nona-win32-x64.zip`, `nona-win32-arm64.zip`   | `win32-x64`, `win32-arm64`   |
| Linux x64 / ARM64           | `nona-linux-x64.zip`, `nona-linux-arm64.zip`   | `linux-x64`, `linux-arm64`   |
| macOS Intel / Apple Silicon | `nona-darwin-x64.zip`, `nona-darwin-arm64.zip` | `darwin-x64`, `darwin-arm64` |
| FreeBSD / OpenBSD x64       | `nona-freebsd-x64.zip`, `nona-openbsd-x64.zip` | `freebsd-x64`, `openbsd-x64` |

On POSIX systems run `chmod +x nona` if the archive tool drops the permission. To try Nona without installing anything, use the [playground](/playground).

### Build from source

You need Node.js 26 or newer and npm, on any host that runs Node.js 26.

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

The compiler entry point is `dist/cli.js`. `npm link` in the repository puts a `nona` command on your `PATH`. The rest of this site writes `nona`; from a clone run `node dist/cli.js` instead.

## Your first program

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
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

The compiler is a cross-compiler: any host can produce executables for any of the eight [native platforms](/reference/native-platforms). `--target` selects the output format and CPU; without it the target is the host's OS and CPU.

```sh
nona build hello.js -o build/hello --target linux-arm64
nona build hello.js -o build/hello.exe --target win32-x64
```

A cross-compiled executable runs only on the matching OS and CPU. Linux, BSD and macOS outputs are written with mode `0755`.

## Modules

A `.mjs` input, or any input compiled with `--module`, is an ES module. Relative imports (`./util.mjs`, `../lib/x.mjs`) are resolved next to the importing file and compiled into the same executable. A CommonJS input is compiled together with everything it `require`s.

Built-in modules use the `nona:` prefix (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`); many Node.js names (`node:fs`, `node:path`, `node:http`, …) are available too. See [Built-in modules](/reference/modules).

## npm packages

Install packages with npm as usual and build: Nona resolves `node_modules` at build time and compiles the packages into the executable. `nona build <package directory>` builds the package's `"bin"` command or `"main"` module. See [npm packages](/reference/npm).

## A Windows program without a console

```sh
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` starts the program without a console window and embeds a default manifest; `--icon` and `--version-info` add resources that Explorer shows. See [Windows executables](/reference/windows-executables) and the [Museum example](/examples/museum).

## Troubleshooting

Compile errors are printed as `file:line:column CODE: message` and the compiler exits with status 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- Unsupported syntax is rejected at compile time instead of failing at run time.
- `E_FFI_TARGET` means a DLL declaration was compiled for a non-Windows target (or a system call for `win32-x64`).
- `E_HOST_MODULE` means a built-in module is not available for the target.
- `EvalError` at run time means `eval` or `Function` received source text that was not known at compile time.

The [command line reference](/reference/cli) lists every option and error.

## Next steps

- [Examples](/examples/) — complete programs with explanations.
- [Language support](/guide/language-support) and [Compatibility and limitations](/guide/compatibility) — what to expect.
- [Built-in modules](/reference/modules) — the host APIs.
