# Original process diagnostic reports (issue #141)

## Runtime contract

`processReportSource` is inserted inside the lazy process builder after the
system helpers. It installs a stable `process.report` object with the public
configuration accessors, `getReport`, and `writeReport`. Argument validation,
accessor descriptors, supplied stack parsing, and failed-open behavior are
checked against the Node 26 executable without consulting its implementation.

The format identifies `header.runtime = "nona"` and Nona schema version 1.
It reports genuine compiler version, process identity, argv, cwd, allocator
memory, OS resources, thread CPU, active resources and environment. It does
not invent Node, V8, libuv, OpenSSL, inspector or heap-space measurements.
Network enumeration comes from the separate original native network adapter.
`excludeNetwork` bypasses enumeration; `excludeEnv` omits environment data.

File output uses synchronous partial-write loops and retries EINTR. Windows
uses CreateFileW/WriteFile/CloseHandle. Linux, Darwin, FreeBSD and OpenBSD use
their existing OS open/write/close adapters. stdout/stderr are borrowed.

## Required integration

Capture `reportIntrinsics` inside the existing outer IIFE before user code:
Error, Uint8Array, Uint32Array, Uint8Array.prototype.subarray, Math.min, Date,
Object.keys, Array.isArray, JSON.stringify, String, Array.prototype.push,
String.prototype.trim and Date.prototype getTime/toISOString/getFullYear/
getMonth/getDate/getHours/getMinutes/getSeconds. The source uses original
Reflect.apply and Object.defineProperty already captured by process.

The private network hook is `vm.processReportNetworkInterfaces()`.
The signal hook is `vm.processReportSignalWatch(name,enabled)`; it updates a
private report registration independently of public EventEmitter listeners.
Signal delivery calls `vm.processReportSignal(name)`.

Before the final unhandled `fatalException(error,1)`, call
`if(reportUncaught) reportAutomatic(error,'Exception','Exception')`.
Handled exceptions and capture callbacks do not produce automatic reports.
Report generation errors preserve the original exception and exit status.

## Emergency fatal reports

`emitProcessFatalReport` owns bounded static native path/header/output buffers.
The private `reportConfigure(buf,u64,buf,u64)` copies configuration before a
failure. Oversized/busy configurations return errno without replacing a
working configuration. It installs a callback address in the base runtime's
zero-initialized `rt.fatalReportHook` slot. The base runtime has no reference
to a process helper when the module is absent.

`rt.fail` calls that pointer conditionally before the ordinary exit hook.
The callback uses an atomic recursion guard, current allocation-free
`process.heapSnapshot`, native unsigned decimal formatting, OS file I/O,
and no managed allocation, collection or JavaScript. Output errors return
to the original fatal path. The emergency report explicitly labels its
metadata timestamp `configurationTime`; it does not present stale values
as measurements made at failure time. Its current allocator counters are
measured during failure. No environment or network state is retained in
this emergency configuration.

## Verification gates

Dedicated source tests contain Node black-box oracles and compile-only cases
for all eight targets. Native helper emission checks verify no allocator/GC
calls. Native CI must additionally execute file output and parse its JSON,
check missing-directory behavior, verify handled versus unhandled automatic
reports, and exercise the emergency callback through an intentional runtime
fatal fixture rather than an invalid native signature. Disabled fatal
configuration must create no file. Signal report delivery and restoration
need child-process tests alongside the signal dependency. No generated
native executables are executed locally.

Primary documentation:

- https://nodejs.org/api/report.html
- https://nodejs.org/api/process.html#processreport
