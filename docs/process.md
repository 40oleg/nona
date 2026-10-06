# Process API

`process` is a lazy global object on all eight native targets. It is also the
default export of `node:process` and `nona:process`. Named exports include
the metadata, control, timing, streams, events and OS helpers described below.

`getBuiltinModule(id)` synchronously returns the actual default export of an
implemented builtin, with shared identity for bare and `node:` aliases.
`getBuiltinModule('process') === process`. Unknown names return `undefined`;
non-string arguments, including boxed strings, throw `ERR_INVALID_ARG_TYPE`.
Nona modules without a default export return their actual module namespace
through the explicit `nona:` name. The compiler links literal requests or the
target-supported inventory for computed requests; evaluation remains lazy.
This registry uses compiled modules and introduces no interpreter or package
loader. `fs` remains unavailable on Darwin and BSD.

`abort()` terminates immediately without running exit, beforeExit, capture,
queued callbacks or finalization handlers. POSIX restores and unblocks SIGABRT
and delivers the real signal; macOS uses the operating system's abort service.
Windows terminates through `ExitProcess(134)`, matching the Node 26 native
oracle, with no CRT dependency. Native probes require empty stdout and the
actual POSIX SIGABRT or Windows status 134. CI disables core files and Windows
error dialogs for these child probes.

| Member | Behavior |
| --- | --- |
| `argv` | `[execPath, ...arguments]`. There is no script path: `argv[1]` is the first program argument. Windows uses `CommandLineToArgvW` quoting rules. |
| `argv0` | The original executable argument before replacement with `execPath`. |
| `execArgv` | An empty array: generated programs have no Node.js interpreter flags. |
| `env` | Captured on first access; assignment coerces values to strings and deletion removes entries. Windows keys are case-insensitive. Windows and Darwin mutations update OS environment services; all targets also publish an owned native UTF-8 envp vector. Windows hides `=C:` entries. |
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

`process` inherits the canonical `EventEmitter`; standard input inherits
`Readable` and standard output/error inherit `Writable` from `node:stream`.
Their constructors and module aliases share identity. Listener introspection,
raw once wrappers, maximum-listener warnings and rejection capture use the same
original Events implementation.

Output writes pass through real Writable queues, encoding, cork/writev fallback,
callbacks, drain and finalization. Native descriptor writes are synchronous and
handle partial writes and interrupted syscalls. Input uses Readable queues,
encoding, read/readable/data/end events, pause/resume, backpressure, iterators,
pipe/unpipe and destruction. Its OS descriptor is polled when requested by a
reader; input never blocks the scheduler waiting for unavailable data.
`stdin.unref()` removes input from loop keepalive while other referenced work
still permits ready input delivery. Ordinary `pipe(stdout)` does not end stdout;
`pipeline` explicitly ends its destination. Terminal-specific controls are not
provided by the descriptor streams. See [Streams](host-apis.md#streams).

Normal completion emits `beforeExit`; newly scheduled work delays `exit`.
Once listeners remain single-use during nested emission; changes to `exitCode`
from normal-completion `exit` listeners determine the final status.
Explicit `exit()` emits `exit` once before terminating. `emitWarning()` queues a
warning event and writes a diagnostic to stderr; warning details and deprecation
flags are supported. Next-tick callbacks retain their captured asynchronous
storage; the private queue does not require eager construction of process.

### Runtime exceptions and promise rejections

Unhandled JavaScript throws from program entry, next ticks, queued microtasks
and timer callbacks dispatch `uncaughtExceptionMonitor(error, origin)` before
`uncaughtException(error, origin)`. The origin is `uncaughtException` or
`unhandledRejection`. An exception listener or capture callback allows remaining
jobs and timers to continue. Monitor listeners alone do not suppress a fatal
exit. Allocator failures and other unrecoverable native failures retain their
native failure path.

`setUncaughtExceptionCaptureCallback(functionOrNull)` installs or clears one
callback; `hasUncaughtExceptionCaptureCallback()` reports its presence. Capture
suppresses the uncaught event while monitors still run. Invalid callbacks and
duplicate registration have Node-compatible error codes. The additional
`addUncaughtExceptionCaptureCallback(callback)` callbacks run in reverse registration
order; returning true handles the exception. The legacy capture callback takes
precedence, and the presence query reports only that legacy callback. A fatal unhandled
exception exits with status 1 and emits `exit` without `beforeExit`; a failure
inside an exception/monitor/capture handler exits with status 7 and skips further
JavaScript lifecycle callbacks.

`unhandledRejection(reason, promise)` runs after pending promise jobs. A handler
attached within that batch prevents reporting. After a reported promise gains a
handler, `rejectionHandled(promise)` runs after queued reactions. Classification recognizes native Error objects through live proxy targets without
calling property traps; revoked proxies dispatch an uncaught TypeError. Diagnostic
formatting for other object reasons is intentionally generic and does not inspect
user properties. Events receive
the actual originating promise; propagation through `.then()` tracks the child
separately. Without an unhandled-rejection listener, the compiler's existing
`throw` or `ignore` policy applies. `throw` escalates with origin
`unhandledRejection`; non-Error reasons use `ERR_UNHANDLED_REJECTION`. Hooks install
on first process access and observe rejections queued earlier in the same turn.
Node's additional interpreter policy flags and V8 diagnostic stacks are absent.

`version`, `versions.nona` and `release.name` identify the actual Nona compiler
release embedded at build time. `config` is a frozen Nona object describing the
runtime, version and native target; it is not a Node build configuration.
`features.aot` reports native compilation, while Node-specific inspector,
libuv, TLS and loader features report false. Nona does not advertise Node, V8,
OpenSSL or libuv versions or fabricate Node release download URLs.
`finalization.register(ref, callback)` runs the callback with `(ref, 'exit')` if
its object or function reference remains reachable at exit.
`registerBeforeExit(ref, callback)` uses the `beforeExit` lifecycle event;
`unregister(ref)` cancels matching registrations in both lists. Registrations
use native weak keys: collected references are skipped, and their callbacks are
released. A callback closure that captures its reference keeps it alive.
Listeners are installed lazily, preserving lifecycle registration order; callbacks
registered during dispatch participate in that event. Finalization is a best-effort
lifecycle notification, not a replacement for explicit resource cleanup. Fatal
handler failures and abrupt OS termination do not run these callbacks.
`cpuUsage(previous?)` reports actual OS CPU microseconds. `resourceUsage()` reads
POSIX `getrusage` counters (peak RSS in KiB); Windows supplies CPU time, peak RSS
and minor page faults from native process APIs. Unavailable Windows resource
counters are omitted. `kill(pid, signal?)` delivers native POSIX signals, or
checks process existence with signal 0; Windows supports existence checks and
termination signals. Installing JavaScript signal handlers is unsupported.
`threadCpuUsage(previous)` returns current JavaScript-thread user/system CPU microseconds and optionally subtracts prior values. Windows uses GetThreadTimes with the current-thread pseudo handle; Linux/FreeBSD14.3/OpenBSD7.8 use verified RUSAGE_THREAD=1. Darwin uses Mach THREAD_BASIC_INFO=3 with ten 32-bit words and signed seconds/microseconds time values, retaining one thread right for the runtime lifetime. The API queries actual thread counters, not process-wide CPU totals. Previous-value validation follows the Node26 oracle, including nonnegative fractional values and ignored falsy arguments.

`execve(file, args = [], env = process.env)` invokes the real POSIX exec syscall
on Linux, Darwin, FreeBSD and OpenBSD. On Windows, the function throws
ERR_FEATURE_UNAVAILABLE_ON_PLATFORM before argument validation, matching Node 26.
Successful execution replaces the image without running exit listeners, queued
ticks, Promise jobs or timers; the process ID remains the same. The kernel's
file-descriptor/CLOEXEC rules apply. File/argument/environment strings reject
embedded NUL before the syscall. Original native packing owns NUL-terminated
UTF-8 strings and pointer vectors for argv and custom envp; custom environments
do not mutate the current process.env or its authoritative native vector. OS
errors throw with code, errno, syscall=execve and path while the current image
continues running. Packing mappings are replaced on subsequent calls and have
bounded ownership per vector; they are outside the JavaScript allocator.
Native CI self-execs the compiled image with Unicode argv/custom environment,
checks PID identity, and verifies old callbacks are discarded.

POSIX also exposes `getuid`, `geteuid`, `getgid`, `getegid`, `getgroups`, `umask`,
and `setuid`, `seteuid`, `setgid`, `setegid`, `setgroups`, `initgroups`. Group
queries include the effective group. Setters accept unsigned 32-bit IDs or account
names and report native permission errors. Darwin resolves names through the OS
libSystem account database and calls native `initgroups`, including the system's
Directory Service integration. Linux/BSD use an original scanner for local
`/etc/passwd` and `/etc/group` records. Their `initgroups` collects explicit local
group memberships, includes the extra group once, and invokes native setgroups.
Named initgroups users need not have passwd records; permission errors come from
the real group setter. Numeric users still resolve their UID to a local name.
Linux/BSD remote NSS, LDAP and NIS account resolution is unsupported; local files
are not presented as equivalent to those services. Unknown setter account/group names
throw `ERR_UNKNOWN_CREDENTIAL`; invalid numeric IDs and NUL names fail before a
credential syscall. Darwin copies OS-managed record prefixes and names before
another lookup can invalidate their thread-local storage. Windows omits POSIX
credential APIs. Native probes resolve the current owner and only reapply the
same effective IDs; group-changing operations are verified with source mocks.

`loadEnvFile(path = './.env')` reads a real UTF-8 file through OS services on all
targets. An original parser handles whitespace, comments, export prefixes,
quoted/multiline values, double-quoted newline escapes, and duplicate keys.
Existing environment entries take precedence. Paths may be strings or byte
arrays; URL paths await the URL dependency. `NODE_OPTIONS` is environment data
and does not enable an interpreter option in compiled Nona programs.

Environment assignments and data descriptors share the native update path.
Descriptors must explicitly be writable, enumerable and configurable; accessor
and partial descriptors throw `ERR_INVALID_OBJECT_DEFINE_PROPERTY` like Node.
Native names and values terminate at the first NUL, and the JavaScript view uses
the same truncation. Empty names and names containing `=` are ignored. Each
mutation replaces a private page-backed UTF-8 envp vector and releases its old
mapping; kernel startup storage remains untouched. The vector supports future
native exec/FFI integration, and is valid until the next mutation. Linux/BSD
have no kernel getenv/setenv service and do not link libc: this private Nona
vector is authoritative, not a claim that an arbitrary external library's
environment was changed. Darwin also calls OS libSystem setenv/unsetenv and
queries its real getenv in native regression probes.

`getActiveResourcesInfo()` lists actual pending timers as `Timeout` and referenced
flowing input as `NonaStdin`. Resource names describe Nona's event loop; there are
no libuv handles. `ref`/`unref` support the `nodejs.ref`/`nodejs.unref` symbol
protocol, plus legacy methods. stdin implements both forms.

`availableMemory()` reads native free/available physical memory: Windows memory
status, Linux `MemAvailable` and cgroup usage, FreeBSD free-page sysctls, OpenBSD
UVM counters, or Darwin Mach host statistics. It caps the result by configured
process limits. `constrainedMemory()` reads finite POSIX data/address-space
limits, Linux cgroup memory ceilings, or Windows Job Object memory limits;
zero means no finite limit was found. Queries are snapshots, not allocation
guarantees; unavailable counters fail explicitly. Linux supports conventional
cgroup mounts. Windows queries the current job. BSD/Darwin page counts exclude
potentially reclaimable inactive pages.

`memoryUsage()` returns the Node-compatible five-field shape, with real Nona
allocation accounting. `rss` and `memoryUsage.rss()` query current OS residency:
Windows working set, Linux VmRSS, Darwin task resident size, or BSD process
resident pages. This is not the high-water mark from `resourceUsage()`.
`heapTotal` counts reserved allocator chunk and large mappings, including the
large mapping reuse cache. `heapUsed` counts allocated cell/mapping bytes,
including allocator overhead and buffer backing storage. `external` and
`arrayBuffers` count requested backing allocation bytes of ArrayBuffer and
SharedArrayBuffer allocations; views do not count the same storage again.
Ordinary ArrayBuffer storage belongs to the managed heap and also contributes
to heapUsed. Detached owners retain their backing storage until collected;
dead managed allocations remain counted until GC sweeps them. SharedArrayBuffer
storage uses separate OS heap allocations that currently survive GC and agent
aliases; its requested bytes remain counted after owners are collected and do
not contribute to heapUsed. These are Nona allocator measurements,
not V8 heap estimates. The private native snapshot allocates no objects and
does not trigger GC.

`process.title` reads and writes real OS title storage. Linux and macOS updates
are limited to the original contiguous argument bytes and preserve startup
environment storage; Linux also updates the kernel thread name. BSD updates use
native ps_strings (2047 UTF-8 bytes maximum), and FreeBSD synchronizes its kernel
argument cache. `argv`, `argv0`, and the owned native environment retain their
original values. Values use ordinary string coercion, reject Symbols, and stop
at NUL. Windows initializes its cached title from the executable path and
updates the attached console title when available. The public value retains
its most recent assignment when no console is attached, matching Node 26;
external console-title changes do not replace this process-owned value.
IPC/channel APIs, worker integration, V8 heap reports, remote Linux/BSD account resolution,
Node.js/V8 version metadata, debugger APIs
and interpreter flag processing remain absent. Nona does not fabricate V8 or
IPC behavior. Error messages and some OS error mappings differ from Node.js.

Programs that never link the process prelude have no process startup work.
Once linked, monotonic uptime starts during prelude initialization; metadata
and environment decoding remain lazy. Node.js 26 black-box oracles check the
shared API and native CI probes exercise all eight targets.

The focused finalization and builtin-registry GC-stress probes use an empty
POSIX environment or only `SystemRoot` on Windows. Environment compatibility
probes retain the inherited environment; native execution budgets are unchanged.

## Native signals and diagnostic reports

Signal listeners receive OS delivery on the main runtime. Linux uses native
handlers and polling; BSD and macOS use kqueue; Windows supports console
SIGHUP, SIGINT and SIGBREAK. Listeners do not keep the event loop alive.
Aliases share registration and removing the last listener restores the previous
OS disposition. SIGPIPE and SIGXFSZ are ignored during main runtime startup;
worker initialization leaves process-wide dispositions alone.

`process.report` provides `getReport`, `writeReport`, directory/filename/compact,
excludeEnv/excludeNetwork, signal, and automatic signal, uncaught-exception and
fatal-error configuration. Reports identify Nona schema version 1 and include
real process identity, allocator counters, OS resources and network interfaces.
Handled exceptions do not generate automatic reports. Signal reporting owns
an independent registration, so removing public listeners does not disable it.

Normal reports perform complete synchronous OS writes and close owned files.
The fatal path uses bounded static native storage, allocation-free allocator
counters and OS writes; it avoids JavaScript callbacks after allocator failure.
Its metadata timestamp is explicitly the configuration time. Configuration
larger than 32 KiB fails without replacing the previous configuration.
Native execution and intentional allocation-failure verification remain CI gates
until the process pull request is integrated.

The allocation-failure regression runs only in isolated CI children. It uses
a Windows process-memory Job Object, Linux/FreeBSD/macOS address-space limits,
or OpenBSD's anonymous-mapping [data limit](https://man.openbsd.org/setrlimit.2).
It requests a 1 GiB backing store after configuring a lower native limit;
it does not fill that memory or manufacture failure with an invalid FFI call.
