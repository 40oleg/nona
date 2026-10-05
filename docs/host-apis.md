# Host APIs

Process thread CPU accounting uses real Windows thread times, Linux/BSD
RUSAGE_THREAD or Darwin Mach thread_info. POSIX process.execve replaces the
current image through the native kernel syscall using original owned argv/envp
vectors. Windows exposes the function and throws
`ERR_FEATURE_UNAVAILABLE_ON_PLATFORM` before argument validation, matching
Node.js 26. Native probes verify self-reexecution and PID identity.

POSIX process credentials accept numeric IDs and names. Darwin resolves names
through OS libSystem account services and uses native initgroups. Linux/BSD
resolve local /etc/passwd and /etc/group using original scanners and pass actual
IDs to native credential syscalls; remote NSS/LDAP/NIS resolution is absent.

Process memory reporting queries current native resident memory on every target.
Its allocation-free private adapter walks Nona's actual allocator mappings and
buffer owners; the public Node-compatible fields describe Nona allocation
semantics as detailed in [process](process.md), without inventing V8 counters.

Process environment mutation publishes an original owned native UTF-8 envp
vector for native execution adapters. Windows also updates kernel32 environment
state; Darwin updates the authorized OS libSystem environment. Linux/BSD do not
pretend to offer a kernel setenv operation or modify unrelated library state.

Nona programs run without Node.js. The host APIs below are implemented by the
native runtime and small JavaScript preludes compiled into every executable.

See [native platforms](native-platforms.md) for the OS/CPU capability matrix. The [process adapter](process.md), timers, clocks and the shared runtime are available on every enabled target. The optional filesystem adapter requires Windows or Linux.

Process standard streams use native descriptors without external libraries:
UTF-8/byte writes are synchronous, and flowing stdin is polled by the event loop.
The process adapter also provides lifecycle/warning events, OS CPU/resource
queries and native process control; see its documented compatibility boundaries.
Native process file reads support dotenv loading on every target independently
of the optional filesystem module. POSIX numeric credential operations and
native memory availability/limits use the selected OS's actual ABI.

Script functions can shadow built-in and host global names such as `escape`, `unescape`, `process`, timers and `TextEncoder`/`TextDecoder`. Runtime initialization completes first; declarations install writable, enumerable, nonconfigurable global properties.

## Timers and the event loop

Globals: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`,
`clearInterval`, `queueMicrotask(callback)` and `performance.now()`.

- After the top-level program the entry runs an event loop: it drains the
  Promise job queue, then repeatedly waits for the nearest timer deadline, runs
  that callback and drains the job queue again. The process exits when no
  timers remain.
- Timers are ordered by deadline, then by registration order. The delay follows
  Node.js: it is converted with `ToNumber`, and values that are `NaN`, below 1 or
  above 2^31-1 become 1.
- Timer ids are Numbers (Node.js returns `Timeout` objects). `clearTimeout` and
  `clearInterval` accept any id; unknown ids are ignored.
- Waiting uses `Sleep` on Windows and `nanosleep` on Linux, so an idle program
  does not use the CPU. On Windows the resolution is the system timer tick
  (typically 15.6 ms).
- `performance.now()` uses the monotonic clock (`QueryPerformanceCounter`,
  `clock_gettime(CLOCK_MONOTONIC)`) and counts milliseconds from program start.
- An uncaught exception in a timer callback terminates the process with exit
  code 1, like an uncaught exception in the top-level program.
- Realms created by the Test262 host do not install their own timers.

## Long-running programs

- The collector counts committed coroutine stacks (1 MiB per running async
  function or generator, `rt.generatorStackBytes`) towards its threshold, so
  abandoned coroutines, whose stacks only the sweep releases, trigger
  collections like ordinary garbage.
- `tests/stability.test.ts` checks that ten times more timer firings (with
  promise jobs and garbage in every tick) do not raise peak memory, that
  thousands of abandoned coroutines are released, and that a program waiting
  for a two-second timer uses almost no CPU.
- Known limits: property, element and Map storage is linear (#36), so programs
  with hundreds of live timers or large objects slow down; on Linux every heap
  block is a separate memory mapping (#37).
