# Native platform expansion (#117)

## Outcome and constraints

Produce standalone native programs for eight explicit targets:
`win32-x64`, `linux-x64`, `darwin-x64`, `darwin-arm64`, `linux-arm64`,
`win32-arm64`, `freebsd-x64`, and `openbsd-x64`. Preserve the current
supported JavaScript semantics from main at `569270a`; this work does not
expand the ECMAScript conformance claim. The user authorized autonomous
implementation and a PR. On 2026-10-05 the owner authorized merging PR #122
and resolving any conflicts, superseding the earlier no-merge instruction.

The compiler and runtime remain implemented in this repository: no LLVM,
C toolchain, interpreter, or bundled OS libraries in the generated program.
The owner authorized macOS system libSystem on 2026-10-05 for native startup
and OS services; other targets remain libc-free. Platform-provided Windows DLL imports retain their
existing role. Unsupported optional native interop must fail explicitly,
with the capability and target named in the diagnostic.

Linux distributions share one target for each CPU architecture. Mint,
Fedora, Ubuntu, and Debian compatibility is a test dimension, not four
different code generators. Kernel/OS version floors must follow the
actual system interfaces used, rather than assumptions about a distro.

## Current structure and approach

The frontend and IR are shared, but `RuntimeBuilder` and `generate` emit
x64 operations through `Assembler`. The runtime uses a Win64-style
internal ABI on both existing targets; Linux supplies syscall shims for
the Windows imports. NativeProgram currently carries fragments, import
cells, addresses, and PE-oriented unwind information. Raw x64 emissions
include signed-division setup, setcc, timestamps, syscalls, and x87 Math.

Three approaches were considered. Duplicating the entire runtime for
ARM64 would make semantic fixes drift. A C/LLVM backend would introduce
toolchain/runtime dependencies contrary to AGENTS.md. The selected
approach shares the semantic emitter/runtime and adds a native ARM64
lowering layer, OS service adapters, and executable writers. The
implementation proceeds through x64 OS ports before the ARM64 ports so
format/OS failures can be distinguished from CPU failures.

## Target and capability boundary

A single `src/target.ts` owns target names, OS, CPU, format, executable
permissions, and host detection. Detection must consider both
`process.platform` and `process.arch`; unknown hosts never silently
become Windows x64. Explicit cross-compilation remains available even
when host auto-detection is unsupported. Compiler, CLI, built-in modules,
runtime/cache identity, and host test helpers consume this definition.

Target descriptors are not support claims. A new target is exposed as
implemented only when its emitter and OS adapter can produce runnable
programs. Incompatible PE resource/subsystem flags and unavailable
foreign-call declarations produce positioned target diagnostics.

## Machine emission

Keep the existing x64 output path unchanged where possible. The shared
runtime emission API describes integer/FP loads and stores, arithmetic,
branches, labels, calls, atomics, memory moves, and stack operations.
Existing register names may act as logical roles during the migration;
ARM64 lowering maps them to its own registers and emits AArch64 machine
instructions at compilation time. No x64 interpreter is embedded.

ARM64 must preserve the runtime's stack slots, Value roots, and suspended
generator/coroutine state. Its internal software-stack representation
must be separated from the platform ABI stack: Windows, Darwin, and
Linux native calls still receive their required alignment, argument
registers, nonvolatile state, and return convention. Thread startup must
initialize the correct native and internal stack in the child.

Arithmetic lowering includes signed/unsigned division, high multiply,
branch-condition flags, unordered FP comparisons, conversion overflow,
negative zero, atomics and ordering, and 128-bit FP register moves.
Raw x64-only operations become named semantic operations. x87
transcendentals require self-contained binary64 numerical helpers for
ARM64; they cannot pass through as x64 bytes or call an external libm.

Generation context and persistent base-image cache identity include the
architecture and target capabilities. Context is restored on exceptions
and nested compilation; fragments from different architectures cannot
be reused accidentally.

## Executable and operating-system boundary

ELF layout accepts the CPU machine number and OS metadata, validates
addresses/fixups, and retains separate read/execute and write segments.
FreeBSD/OpenBSD adapters implement their actual syscall/error conventions
and any required ELF identification or syscall-entry metadata.

Mach-O layout covers x64 and ARM64, entry state, segment permissions,
page alignment, and checked addresses. ARM64 output includes an embedded
ad-hoc code signature generated without a target SDK. Signature page
hashes cover the final relocated image. Platform-specific startup must
be proven by executing the output on macOS, not only by inspecting it.

PE ARM64 uses the correct machine identifier, import/export conventions,
relocation behavior, and platform call bridge. Existing x64 resources and
subsystem behavior must remain intact.

OS adapters supply memory allocation/protection/free, UTF-8 console/file
IO, process exit/identity, real-time and monotonic clocks, sleep,
thread creation, and wait/wake operations. Optional host APIs and raw FFI
syscall numbers are target-specific and must never be silently remapped
as though every OS used the Linux x64 table.

## Verification and PR

Pure TypeScript, encoding, relocation, and layout tests may run locally.
Do not launch generated Windows executables on this host: the previous
full native run triggered repeated Application Control dialogs. Do not
install WSL, weaken OS security, or change global Node selection.

CI runs the existing regression plus native platform probes. GitHub
provides x64/ARM64 Windows, Linux, and macOS runners; BSD probes execute
inside actual BSD VMs after compilation on the Linux host. The probe
corpus covers hello-world, chained arithmetic, string operations,
functions/closures, arrays/objects, exceptions, GC stress, modules,
generators/async, clocks/timers, file IO, and shared-memory behavior.
Tests distinguish compiler host, emitted target, and execution host.

All targets must execute representative programs and match the
documented oracle outputs. Format-only and emulated tests are useful
intermediate evidence, and are labeled as such. A target is not marked
verified until its native execution gate passes. The final PR contains
`Closes #117`, exact verification results, and remaining limitations;
it remains unmerged for the user to review.

## Sources checked

- [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Apple Mach-O overview](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/CodeFootprint/Articles/MachOOverview.html)
- [Apple platform security](https://help.apple.com/pdf/security/en_GB/apple-platform-security-guide-b.pdf)
- [XNU syscall definitions](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/syscalls.master)
- [FreeBSD VM action](https://github.com/vmactions/freebsd-vm)
- [OpenBSD VM action](https://github.com/vmactions/openbsd-vm)
