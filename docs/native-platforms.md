# Native platforms

Nona cross-compiles JavaScript directly to machine code. The compiler runs on
Node.js 26; the generated program needs neither Node.js nor a C toolchain.
Choose an output target with `--target`. The default is the host OS and CPU.

| Target | CPU | Format | Native verification |
| --- | --- | --- | --- |
| `win32-x64` | x86-64 | PE32+ | Windows full regression and example comparisons |
| `linux-x64` | x86-64 | ELF64 | Ubuntu runner; distribution containers |
| `linux-arm64` | AArch64 | ELF64 | Native Ubuntu ARM runner, CPU/math/GC/agent probes |
| `win32-arm64` | AArch64 | PE32+ | Native Windows 11 ARM runner, GC/agent probes |
| `darwin-x64` | x86-64 | Mach-O64 | Intel macOS 15 runner, clocks/GC/agent probes |
| `freebsd-x64` | x86-64 | ELF64 | FreeBSD 14.3 VM, clocks/GC/agent probes |
| `openbsd-x64` | x86-64 | ELF64 | OpenBSD 7.8 VM, clocks/GC/agent probes |
| `darwin-arm64` | AArch64 | Mach-O64 | Dynamic dyld/libSystem path; Apple Silicon CI verification pending |

Apple Silicon executables load the operating system's `/usr/lib/libSystem.B.dylib` through dyld. This macOS exception was authorized by the owner; it adds no bundled runtime, interpreter or C toolchain. PIE data pointers are rebased by dyld, imports are eagerly bound, and an embedded ad-hoc signature covers the final image. Intel macOS retains direct kernel startup.

```sh
node dist/cli.js build hello.js -o hello --target linux-arm64
node dist/cli.js build hello.js -o hello.exe --target win32-arm64
node dist/cli.js build hello.js -o hello --target darwin-x64
node dist/cli.js build hello.js -o hello --target darwin-arm64
node dist/cli.js build hello.js -o hello --target freebsd-x64
node dist/cli.js build hello.js -o hello --target openbsd-x64
```

## Linux distributions

Mint, Ubuntu, Debian, Fedora and Alpine do not require separate native builds
for the same CPU. Linux binaries use direct kernel calls and have no ELF
interpreter or libc dependency. CI executes the same x64 output in Ubuntu
20.04/24.04, Debian 12, Fedora 43 and Alpine 3.22 containers. Mint shares the
Ubuntu userspace family; it has not been separately executed in CI.

Containers share their host kernel. These checks establish userspace
compatibility, not a historical kernel minimum. No claim is made that every
old distribution or kernel works. Cross-compilation does not convert CPU
architectures: an ARM64 executable requires an ARM64 OS.

Linux ARM ELF segments and large allocations align to 64 KiB, and coroutine
guard regions cover 64 KiB. This accommodates 4/16/64 KiB page geometry. Native
execution has been checked on the Ubuntu ARM runner; a 64 KiB kernel has not
been tested separately.

## Runtime and host APIs

Every enabled target shares the JavaScript runtime: objects, strings, BigInt,
garbage collection, generators, async functions, timers and Atomics. The
platform layer implements memory mapping/protection, output, process exit,
wall/monotonic clocks, sleeping, thread creation and wait/wake operations.

`process`, `node:process`, `nona:process`, `node:fs` and `nona:fs` are available
on Windows and Linux x64/ARM64. Their syscall numbers, flags and structure
layouts follow the selected target. Darwin and BSD optional process/filesystem
adapters remain unavailable and produce `E_HOST_MODULE`; `--full-runtime`
also requests the process adapter and is therefore unavailable on those ports.
Object reflection links the available preludes without requesting that
unavailable adapter; ordinary `getOwnPropertyNames`/`Reflect.ownKeys` work.

Raw `nona:ffi` syscall declarations use the **target kernel's actual syscall
number** (on Darwin, the BSD number without its class prefix). They are not
translated from Linux x64 numbers. Kernel failures return negative `errno`.
Windows DLL calls
use the target CPU ABI. FFI callbacks and variadic signatures remain unsupported.
GUI subsystem/resources remain supported on Windows x64.

Windows ARM uses a separate runtime stack and native call/thread bridges.
Hardware exception unwinding and OS stack walking through generated ARM
frames are not supported; the linker does not emit misleading x64 unwind
records. JavaScript exceptions use the runtime's own mechanism.

ARM math helpers are compiled into the image and require no `libm`.
Transcendental results are checked against Node.js with numerical tolerances;
identical last-bit results for every input are not guaranteed across engines.
Date retains the existing UTC policy for local fields and formatting. Date
oracle tests explicitly select `Etc/UTC` in Node rather than inheriting the
runner's timezone; this does not add local timezone support to the runtime.

## Verification

`.github/workflows/native-platforms.yml` records native loader/runtime probes,
existing oracle suites, distribution checks and BSD VM execution. The runner
checks both host OS and CPU before executing: Rosetta or accidental cross-CPU
execution is not counted as native verification. The ARM bridge probe also
exercises mixed integer/FP register banks and overflowing stack arguments.

The exact evidence and development failures are recorded in the
[implementation ledger](superpowers/plans/2026-10-04-native-platforms-ledger.md).
Final full regression and whole-branch review are required before PR readiness.
