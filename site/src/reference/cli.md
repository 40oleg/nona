# Command line

## Synopsis

```text
Nona 0.9.0 — JavaScript subset to native executables
Usage: nona build <input.js> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|darwin-arm64|freebsd-x64|openbsd-x64] [--module]
       [--full-runtime] [--call-stats] [--coverage dir]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

From a clone of the repository run `node dist/cli.js …`; after `npm link` the same command is available as `nona`.

## Options

| Option | Value | Description |
| --- | --- | --- |
| `-o` | path | Output file. Required. Missing directories are created. |
| `--target` | [Native platforms](/reference/native-platforms) | PE32+, ELF64 or Mach-O64; default: host OS and CPU. |
| `--module` | — | Compile the input as an ES module. Inputs ending in `.mjs` are modules automatically. |
| `--full-runtime` | — | Link the whole runtime. By default the RegExp engine, its Unicode property tables and the Unicode normalization tables are linked only when the program can reach them; see [Linked runtime parts](/guide/compatibility#linked-runtime-parts). |
| `--call-stats` | — | Count every call the program and its runtime make, by target, and print the counts to stderr when the program ends or fails, most frequent first (`count  target` per line). Calls to function declarations known at compile time are counted under their code label (`js.fn.N`); other JavaScript calls go through `rt.invoke` and are counted there. The executable is larger and slower; use it to find the runtime functions a program spends its calls in. `process.exit()` skips the report. |
| `--coverage` | directory | Count the calls of every function of the program and, when it ends or a runtime error ends it, write them to `<directory>/coverage-<pid>-<n>-0.json` in the format `NODE_V8_COVERAGE` produces, so `c8 report --temp-directory <directory>` turns them into a report. Coverage is per function (like V8's best-effort mode): each function's source range with its call count. The directory must exist. Method names may be empty, and code from compile-time `eval` strings is reported with offsets into those strings. |
| `--subsystem` | `console` (default), `windows` | Windows GUI program without a console window. `win32-x64` only. A GUI program without `--manifest` gets a default manifest. |
| `--icon` | `.ico` file | Embed every image of the icon file. `win32-x64` only. |
| `--manifest` | XML file | Embed an application manifest. It must be valid: Windows refuses to start a program with a malformed manifest. `win32-x64` only. |
| `--version-info` | JSON file | Embed version information (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`). `win32-x64` only. |
| `--help` | — | Print the synopsis. |
| `--version` | — | Print the compiler version. |

Each option may appear once. See [Windows executables](/reference/windows-executables) for the resource formats.

## Input and output

- The input is one UTF-8 source file. A module input pulls in the modules it imports; built-in `nona:*` and `node:*` modules are part of the compiler.
- The output is written to a temporary file next to it and renamed into place, so a failed build never leaves a half-written executable and keeps the previous one.
- The compiler refuses to overwrite its input, including through a hard link or symbolic link.
- Linux, BSD and Darwin outputs get mode `0755`.

## Runtime cache

The compiled runtime and preludes are the same for every program that links the same parts, and generating them is most of a build. The command line keeps them in a cache directory, so later builds are about three times faster (a Linux hello world: 1.1 s, then 0.33 s). The output is identical with or without the cache. Entries belong to one compiler build and are ignored after an update.

| Variable | Effect |
| --- | --- |
| `NONA_CACHE_DIR` | Cache directory. Default: `%LOCALAPPDATA%\nona\cache` on Windows, `~/Library/Caches/nona` on macOS, `$XDG_CACHE_HOME/nona` or `~/.cache/nona` elsewhere. |
| `NONA_CACHE=0` | Do not read or write the cache. |

## Diagnostics and exit codes

The exit status is `0` on success and `1` on any error. Source errors are printed as:

```text
<file>:<line>:<column> <CODE>: <message>
```

| Code | Meaning |
| --- | --- |
| `E_LEX`, `E_SYNTAX` | The source cannot be tokenized or parsed, or uses unsupported syntax. |
| `E_BIND` | An early error found while resolving names (duplicate declarations, invalid assignment targets, …). |
| `E_MODULE` | A module cannot be resolved, read or linked, or exports conflict. |
| `E_FFI_STATIC` | A `define()` call from `nona:ffi` is not three string literals or has an invalid signature. |
| `E_FFI_TARGET` | A DLL declaration for a non-Windows target, or a syscall declaration for Windows. |
| `E_RESOURCE` | An invalid icon or version information, or resources requested for a target other than `win32-x64`. |
| `E_TARGET` | An unsupported target or subsystem. |

Argument errors are printed as `nona: <message>`, for example `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` or `--subsystem requires --target win32-x64`.

## Examples

::: code-group

```sh [Console program]
node dist/cli.js build app.js -o build/app.exe
```

```sh [GUI program with resources]
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
node dist/cli.js build app.js -o build/app --target linux-x64
```

:::


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

Native compiler self-hosting is under validation in [#143](https://github.com/40oleg/nona/issues/143). The development CLI still requires Node.js; the bootstrap probe is not yet the distribution CLI.
