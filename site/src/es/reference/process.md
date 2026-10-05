# API de process

::: info Traducción
Esta página es una traducción de la página en inglés [Process API](/reference/process), generada a partir de [`docs/process.md`](https://github.com/40oleg/nona/blob/main/docs/process.md). La versión en inglés es la de referencia y puede ser más reciente.
:::


## Current API (English)
`process` is a lazy global object on all eight native targets. It is also the
default export of `node:process` and `nona:process`. Their named exports are
`argv`, `argv0`, `execArgv`, `env`, `platform`, `arch`, `pid`, `ppid`,
`execPath`, `exit`, `cwd`, `chdir`, `hrtime`, `uptime` and `nextTick`.

| Member | Behavior |
| --- | --- |
| `argv` | `[execPath, ...arguments]`. There is no script path: `argv[1]` is the first program argument. Windows uses `CommandLineToArgvW` quoting rules. |
| `argv0` | The original executable argument before replacement with `execPath`. |
| `execArgv` | An empty array: generated programs have no Node.js interpreter flags. |
| `env` | A plain snapshot captured on first access. Mutations do not update the OS environment. Windows hides `=C:` entries and merges initially duplicate case-insensitive keys. |
| `execPath` | Absolute executable path. OpenBSD derives it from the startup executable argument and current directory; it does not resolve symlinks or a bare command through `PATH`. |
| `platform`, `arch` | `win32`, `linux`, `darwin`, `freebsd` or `openbsd`; `x64` or `arm64`. |
| `pid`, `ppid` | Native process and parent process identifiers. |
| `cwd()` | Reads the current working directory from the OS. |
| `chdir(directory)` | Changes the OS working directory. Requires a string without NUL bytes; OS failures carry `code`, `errno`, `syscall` and `path`. |
| `exitCode` | Optional integer exit status. Accepts numbers or numeric integer strings; `null`/`undefined` clear it. Non-integers and invalid types throw coded errors. Stored as a signed 32-bit integer. |
| `exit(code?)` | Immediately terminates with the supplied status or `exitCode` (default 0). POSIX statuses retain the low eight bits. |
| `hrtime(previous?)` | Monotonic `[seconds, nanoseconds]`; passing a previous two-element array returns a duration. The origin is arbitrary. |
| `hrtime.bigint()` | Monotonic nanoseconds as a BigInt. Precision is limited by the existing native clock's millisecond floating-point representation. |
| `uptime()` | Seconds elapsed since process prelude initialization. |
| `nextTick(callback, ...args)` | Runs callbacks before Promise jobs at the next drain. Nested ticks run in the same tick batch. Ticks added by Promise jobs run after that microtask batch and before timers. |

The implementation is original Nona code. Native FFI thunks and private
allocation-free memory helpers are compiled into the executable. Windows uses
OS APIs; Linux uses procfs and direct syscalls. Darwin/BSD capture kernel-owned
startup vectors before runtime initialization and use their native syscall
numbers for process control. Apple Silicon retains its existing OS libSystem
boundary. No external JavaScript runtime or polyfill is bundled.

## Compatibility boundaries

This is a process subset. It does not provide EventEmitter methods or lifecycle
events, `stdin`/`stdout`/`stderr` streams, signal handlers or `kill`, IPC/channel
APIs, worker integration, resource/memory/CPU reports, credentials/groups/umask
operations, title changes, Node.js/V8 version metadata, warning/debug/report
APIs or command-line flag processing. Those members are absent. Environment
mutation is local to the snapshot, including case-sensitive property writes
on Windows. Error messages and some OS error mappings differ from Node.js.

Programs that never link the process prelude have no process startup work.
Once linked, monotonic uptime starts during prelude initialization; metadata
and environment decoding remain lazy. Node.js 26 black-box oracles check the
shared API and native CI probes exercise all eight targets.

