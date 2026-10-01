# Process API

`process` is a global object (as in Node.js), also available as the default
export of `node:process` and `nona:process`, which additionally export
`argv`, `env`, `platform`, `arch`, `pid`, `execPath`, `exit` and `cwd`.

| Member | Notes |
| --- | --- |
| `argv` | `[execPath, ...arguments]`. There is no script path: `argv[1]` is the first argument (Node.js puts the script path there). On Windows the command line is split with the `CommandLineToArgvW` rules. |
| `env` | A plain object with a snapshot of the environment at first access. Changes are not passed to the operating system. On Windows the hidden `=C:`-style entries are skipped. |
| `exit(code?)` | Terminates immediately with `code`, or with `process.exitCode` (default 0). |
| `exitCode` | Used as the exit status when the program ends normally. |
| `execPath` | Absolute path of the running executable. |
| `cwd()` | Current working directory. |
| `platform`, `arch`, `pid` | `'win32'` or `'linux'`, `'x64'`, the process id. |

`process` is built lazily on first access, so programs that do not use it pay
nothing at startup. Unlike Node.js it is not an EventEmitter and has no
`stdout`/`stdin` streams, `nextTick`, `hrtime` or `memoryUsage`.

Implementation: every image contains the host functions of both targets, so
one generated program can be linked as PE and ELF; each linker binds the other
target's imports to a stub that returns 0. Windows reads `GetCommandLineW`, `GetEnvironmentStringsW`,
`GetModuleFileNameW` and `GetCurrentDirectoryW` through FFI thunks that the
compiler installs for its own prelude; Linux reads `/proc/self/cmdline`,
`/proc/self/environ` and `/proc/self/exe` and calls `getcwd`/`exit_group`
directly.
