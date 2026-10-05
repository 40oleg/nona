# process API

::: info 翻译说明
本页译自英文页面 [Process API](/reference/process)，其内容来自 [`docs/process.md`](https://github.com/40oleg/nona/blob/main/docs/process.md)。英文版为准，且可能更新。
:::


# Process API

`process` is a lazy global object on all eight native targets. It is also the
default export of `node:process` and `nona:process`. Their named exports are
`argv`, `argv0`, `execArgv`, `env`, `platform`, `arch`, `pid`, `ppid`,
`execPath`, `exit`, `cwd`, `chdir`, `hrtime`, `uptime` and `nextTick`.

| Member | Behavior |
| --- | --- |
| `argv` | `[execPath, ...arguments]`. There is no script path: `argv[1]` is the first program argument. Windows uses `CommandLineToArgvW` quoting rules. |
| `argv0` | The original executable argument before replacement with `execPath`. |
| `execArgv` | An empty array: generated programs have no Node.js interpreter flags. |
| `env` | Captured on first access; assignment coerces values to strings and deletion removes entries. Windows keys are case-insensitive and mutation updates the native environment. POSIX keeps the authoritative environment in Nona memory; there is no kernel `setenv` operation. Windows hides `=C:` entries. |
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

`stdout.write()` and `stderr.write()` write real UTF-8 strings or byte arrays to
native descriptors 1 and 2, including partial-write handling. Writes are
synchronous; optional callbacks run on the next tick. `stdin` uses descriptor 0:
`read(size?)` performs a blocking read; `setEncoding('utf8')`, `data`/`end` events,
`pause`/`resume`, `pipe`, `destroy`, `ref`/`unref`, and `openStdin()` provide a
small readable interface. The event loop polls flowing input between timers.
These are practical standard-stream interfaces, without Node's asynchronous
write backpressure, general stream classes, terminal controls, or full encodings.

Process and standard streams expose listener registration/removal, once and
prepend listeners, `emit`, listener introspection and maximum-listener settings.
Normal completion emits `beforeExit`; newly scheduled work delays `exit`.
Explicit `exit()` emits `exit` once before terminating. `emitWarning()` queues a
warning event and writes a diagnostic to stderr; warning details and deprecation
flags are supported. Maximum-listener warning diagnostics and `rawListeners`
are not yet available.

`cpuUsage(previous?)` reports actual OS CPU microseconds. `resourceUsage()` reads
POSIX `getrusage` counters (peak RSS in KiB); Windows supplies CPU time, peak RSS
and minor page faults from native process APIs. Unavailable Windows resource
counters are omitted. `kill(pid, signal?)` delivers native POSIX signals, or
checks process existence with signal 0; Windows supports existence checks and
termination signals. Installing JavaScript signal handlers is unsupported.
POSIX also exposes `getuid`, `geteuid`, `getgid`, `getegid` and `umask`.

IPC/channel APIs, worker integration, V8 heap reports, credential mutation and
group queries, title changes, Node.js/V8 version metadata, debugger/report APIs
and interpreter flag processing remain absent. Nona does not fabricate V8 or
IPC behavior. Error messages and some OS error mappings differ from Node.js.

Programs that never link the process prelude have no process startup work.
Once linked, monotonic uptime starts during prelude initialization; metadata
and environment decoding remain lazy. Node.js 26 black-box oracles check the
shared API and native CI probes exercise all eight targets.

