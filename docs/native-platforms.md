# Native platforms

Nona cross-compiles JavaScript directly to machine code. The compiler runs on
Node.js 26; the generated program needs neither Node.js nor a C toolchain.
Choose an output target with `--target`. The default is the host OS and CPU.

| Target | CPU | Format | Native verification |
| --- | --- | --- | --- |
| `win32-x64` | x86-64 | PE32+ | Full Windows regression, examples and selected Test262 suites in `check`; also full regression on manual platform runs |
| `linux-x64` | x86-64 | ELF64 | Ubuntu native loader/runtime probes, portable and host API suites, example comparison; distribution containers |
| `linux-arm64` | AArch64 | ELF64 | Native Ubuntu ARM loader/runtime and CPU probes, portable and host API suites, example comparison |
| `win32-arm64` | AArch64 | PE32+ | Native Windows 11 ARM loader/runtime probes, portable and host API suites |
| `darwin-x64` | x86-64 | Mach-O64 | Intel macOS 15 loader/runtime probes and portable suites |
| `freebsd-x64` | x86-64 | ELF64 | FreeBSD 14.3 VM loader and runtime/GC/agent probes |
| `openbsd-x64` | x86-64 | ELF64 | OpenBSD 7.8 VM loader and runtime/GC/agent probes |
| `darwin-arm64` | AArch64 | Mach-O64 | Native macOS 15 ARM loader/runtime probes, dyld/libSystem signature check and portable suites |

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

`process`, `node:process` and `nona:process` are available on all eight targets,
including `chdir`, `ppid`, `hrtime`, `uptime` and `nextTick`; see the
[process API](process.md) for compatibility boundaries. `node:fs` and `nona:fs`
require Windows or Linux x64/ARM64 and produce `E_HOST_MODULE` on Darwin/BSD.
Syscall numbers, flags and structure layouts follow the selected target.
Darwin process memory queries use the OS's libSystem Mach APIs. Intel images
with those imports use dyld/LC_MAIN and preserve argv/env through the system C
entry ABI; Intel images without imports retain direct kernel startup.
`--full-runtime` is available on all eight targets.

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

The platform workflow runs on every pull request and `main` push, including
runtime, compiler and test-only changes. A manual dispatch runs the same
platform matrix plus the full Windows x64 regression. The separate `check`
workflow runs the full Windows x64 suite and Test262 selections on PRs and
`main`; the platform workflow also checks the browser compiler, samples and
internal site links. `pages` builds and deploys the documentation site.
Linux x64/ARM64, Windows ARM64 and macOS x64/ARM64 run the shared portable
oracle suites on their native runners. Process/filesystem suites run where
those APIs exist: Linux x64/ARM64 and Windows ARM64 here, Windows x64 in
`check`. FreeBSD and OpenBSD execute loader and runtime probes inside VMs;
their portable Node.js oracle suite is not yet run there.
EventTarget, cancellation and asynchronous context also have shared module probes
compiled with allocation stress for all eight targets. These check cancellation
and cleanup despite stopped abort propagation, composed signal event ordering,
EventTarget cancellation, manual resource identity, emitter construction context,
and storage across Promise reactions, await, microtasks and timers. Windows x64
runs those exact probes in `check`; the other platforms execute the images from
the native probe manifest, including the BSD guests. Node host jobs additionally
run the full EventTarget/abort/manual-resource oracle suite.

The Linux
distribution containers share the Ubuntu runner's kernel. BSD VM jobs use an
Ubuntu runner to build the images and host the VM; the probe commands verify
the guest's `uname -s` and `uname -m` before executing binaries.

The exact evidence and development failures are recorded in the
[implementation ledger](superpowers/plans/2026-10-04-native-platforms-ledger.md).
All eight native targets passed at 5391c47 in [native CI](https://github.com/40oleg/nona/actions/runs/37267747072). Intel and Apple Silicon macOS each passed 142 core plus 734 portable tests; Linux/Windows ARM64 also passed 10 host API tests. The [required check](https://github.com/40oleg/nona/actions/runs/37267746992) passed, including 2320 Windows tests, 65 skips, zero failures, example comparisons and the selected Test262 groups. These are the tested OS versions, not a promise of support for every older kernel. Whole-branch review and the subsequent Apple Silicon review are recorded in the ledger.
