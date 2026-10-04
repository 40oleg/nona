# Native platform execution ledger

Issue: #117. Branch: issue-117-native-platforms. Base: 569270afc85a4ece2e1cc312f9c566f2b502d6aa.

## Rulings

- Ruling: proceed autonomously through design, plan and implementation — the user explicitly asked to keep working while away for several hours; the PR remains their review point and is never merged by this task.
- Ruling: reuse the current isolated worktree and create the issue-specific branch from fresh main — tracked files were clean and this preserves the primary checkout and its untracked output/tmp directories.
- Ruling: use native code emission and a shared runtime operation layer rather than C/LLVM or duplicate runtimes — required by AGENTS.md and avoids semantic drift.
- Ruling: native tests execute in CI/VMs — local Windows Application Control has already blocked generated binaries; WSL is not installed and is not installed by this task.
- Ruling: Linux distro names do not become target names — the ABI/CPU determines the emitted Linux file, while distro compatibility remains separately verified.

## Progress

- Repository/architecture exploration complete; no platform implementation or native support claim yet.
- Issue #117 created and claimed with enhancement/blocked labels.
- Spec and implementation plan self-reviewed for target coverage, no placeholders, explicit local execution limits, and native verification gates.

## Task 1 — registry phase

- Introduced OS/CPU/format/file-mode registry and explicit unsupported-host detection. CLI now selects the native host instead of always Windows x64. Frontend target defaults no longer silently select Windows for unknown OS/CPU.
- Ruling: defer the new filesystem syscall tables and process ABI to their OS/architecture implementation tasks; temporarily reject unfinished adapters explicitly rather than emit Windows calls for another OS. The registry describes target identities, not completed backend support.
- Verification: target detection/layout assertions RED → GREEN; build passed; native-target/frontend/PE tests 57 passed.
- Verification correction: the existing PE suite contained three small Windows execution tests and ran them in the combined verification command. Do not describe this run as execution-free. Subsequent local checks must inspect test bodies and use explicit names to exclude all execution tests; full native suites remain CI-only.
- The full repository check has not been run locally due the Windows native-execution constraint; it remains a required remote gate.
- Task 1 integration remains in progress until PE-only options and builtin process platform/arch values are tested for every implemented backend.

## Task 2 — ELF layout phase

- Added ELF machine/OS/page/base options. Linux ARM64 defaults to 64 KiB load alignment; BSD x64 gets its native OSABI identifier.
- Added OpenBSD PT_OPENBSD_SYSCALLS records, validating each location against executable syscall bytes. ET_EXEC pin locations are absolute virtual addresses, matching the kernel's zero exe_base followed by elf_adjustpins.
- Source evidence: OpenBSD sys/kern/exec_elf.c and sys/sys/exec_elf.h (upstream master, inspected 2026-10-04); FreeBSD syscall numbers pinned from releng/14.3 for the following runtime phase.
- Verification: all four missing ELF platform behaviors observed RED; negative/wrapped relocations also observed RED; build and 10 focused layout/registry tests GREEN; existing ELF RIP-fixup test GREEN. These tests inspect bytes only and do not prove execution of a new OS/CPU target.
- Task 2 remains in progress: BSD runtime adapters and native VM gates have not run yet.
- Dependency ruling: shared semantic syscall emission is needed before BSD adapters can safely register locations; implement that part of Task 4 before continuing Task 2 rather than duplicate raw opcode tracking.

## Task 4 — raw operation isolation phase

- Introduced syscall(number), signExtendRax(), timestamp() and setCondition() semantic operations; replaced matching raw instruction call sites in codegen, Date, FFI, random/hash seeding, and Linux services.
- Syscall metadata records the instruction after the MOV-immediate, not the number-loading instruction. Cache encoding/decoding preserves those positions.
- Verification: missing named operations RED → GREEN with independent ISA byte expectations; cached syscall metadata loss RED → GREEN. Build plus focused operation/x64/layout/registry suites: 23 passed. Existing base-cache suite: 4 passed, only compiler/Node subprocesses (no native executable execution).
- Task 4 remains in progress: scoped architecture selection and x87 mathematical operation isolation still need implementation.

## Tasks 3/7 — Mach-O layout and signing phase

- Added a fixed-address Mach-O64 writer with PAGEZERO, separate text/constants/data protections, native x64/ARM64 UNIXTHREAD state, build version, and embedded SHA-256 ad-hoc CodeDirectory/SuperBlob.
- Signing hashes final relocated bytes and load commands; ARM64 uses 16 KiB segment geometry, code-signature hash pages remain 4 KiB.
- Source evidence: Apple XNU mach-o/loader.h, cs_blobs.h and ARM/i386 thread_status.h inspected 2026-10-04. No third-party implementation copied.
- Verification: Mach-O/ARM64/signature behaviors RED → GREEN; 4 layout/signature/bounds tests passed. No macOS native execution result yet.
- Ruling: implement ARM64 Mach-O layout together with x64 layout, before the ARM64 runtime, because the shared writer and signature need early native-loader evidence. This is only format support, not a completed compiler target.

## Task 8 — early native loader gates

- Added six raw loader/ABI probes: Linux x64/ARM64, Darwin x64/ARM64, FreeBSD/OpenBSD x64. They are explicitly marked loader probes, not JavaScript runtime verification.
- Runner validates exact OS/CPU before execution and asks macOS codesign to verify the embedded signature. BSD VM gates run the generated image and compare stdout without installing a Node runtime inside the VM.
- Verification: missing probe generation and host-mismatch checks RED → GREEN; 6 focused probe/Mach-O tests passed; all six files built locally without execution.
- The new workflow runs on this feature branch to validate each backend during development. Existing complete regression gates will run before the PR is ready.

## First native-loader run (9bcd014)

- CI run 37231171114: Linux x64, Linux ARM64, Darwin x64, FreeBSD x64 passed native execution. Darwin ARM64 and OpenBSD x64 failed.
- Darwin ARM64: embedded codesign verification passed, exec rejected with errno 85. XNU mach_loader.c explicitly disallows static ARM64 MH_EXECUTE outside development kernels; dyldMain.cpp explicitly requires libSystem.B.dylib. This conflicts with AGENTS.md's no-libc requirement. Asked the owner asynchronously whether macOS ARM64 may use the mandatory system library; dependent implementation waits for that answer, other work continues.
- OpenBSD 7.8: exec fell back to a shell with NUL-byte syntax failure. Root cause: elf_os_pt_note returns ENOEXEC without the OpenBSD PT_NOTE before the later EI_OSABI fallback. Snapshot bf77f7791990d60dce2ce2110b463cd21f077b72 confirms this in sys/kern/exec_elf.c. Added the required note; regression test observed RED then GREEN locally.
- OpenBSD 7.8 syscall snapshot uses mmap=49 (not the obsolete guessed 197); __tfork=8, futex=83, clock_gettime=87, nanosleep=91, __threxit=302. Use pinned source definitions, never guessed tables.

## Task 2 — BSD runtime adapter phase

- Reused the Linux service bodies through explicit syscall/override hooks; Linux default emission remains unchanged. Added BSD syscall errno normalization and pinned memory/clock/open/exit mappings.
- Implemented native FreeBSD thr_new/thr_exit and OpenBSD __tfork/__threxit entry paths, plus _umtx_op/futex wait/wake adaptations. OpenBSD anonymous mappings carry MAP_STACK for suspended runtime stacks.
- BSD compile target test observed E_TARGET RED then GREEN; 13 focused compile/layout/cache tests passed. Seven runtime probes per BSD target now compile: arithmetic chain, closures/objects, BigInt division/multiplication, x87 Math, generator stack switching, promises/async, realtime clock. Literal outputs verified against independent Node.js execution before remote submission.
- Process/procfs and filesystem adapters are explicitly unfinished and rejected; do not label BSD support complete yet. Full runtime, native thread behavior and GC stress gates remain required.
- Native loader run after the ABI-note fix: recorded below through remote job status; awaiting runtime VM execution of this phase.

## BSD native JavaScript evidence (bd69b35)

- CI run 37231703918: both FreeBSD 14.3 x64 and OpenBSD 7.8 x64 VMs passed all seven compiled JavaScript probes (arithmetic chain/strings, closures/objects, BigInt, Math, generator, async, clock), in addition to their loader probe. Linux x64/ARM64 and Darwin x64 loader probes also passed.
- Extended BSD probes to exercise the monotonic timer loop, forced GC with captured closures/strings, and a real agent thread sharing an Int32Array with Atomics.wait/notify. These stronger checks have built successfully and are now submitted for native execution; they are not claimed passing yet.

## Task 4 — target scope and cache isolation phase

- Routed runtime, numeric helpers and codegen assembler construction through a native-target scope. Unsupported host/unfinished ARM64 dispatch fails explicitly; no x64 bytes can accidentally stand in for ARM64.
- Scopes restore after nested compilation and exceptions. Base/prelude caches are keyed by the full native target; the cross-process cache test observed unsafe Windows/Linux sharing RED then target isolation GREEN.
- Added a cross-compilation test running all BSD probe generation inside an ARM64 outer scope. It exposed unscoped OS service linking RED; BSD/Linux linkers now scope their own service generation and the test is GREEN.
- Verification: build passed; context/cache/probe tests 8 passed; all 20 BSD runtime probe images built locally without execution. Full Windows check/compare and Linux native regression/compare are now scheduled remotely.

## Stronger BSD native run (d63bc5a)

- CI run 37231979751: OpenBSD 7.8 passed all ten runtime probes, including timers, forced GC and a real shared-memory agent thread with wait/notify.
- FreeBSD 14.3 agent probe raised SIGBUS before the loop reached the other strengthened probes. Investigating the exact PC/register state with LLDB in the disposable FreeBSD VM; do not guess a fix from the signal alone.
- Ruling: keep regression gate failure visible; add diagnostic names and a debugger only on failure, preserving the failed exit code. Darwin ARM64 stays an unresolved libc-policy question awaiting the owner's answer.

## Task 5 — ARM64 relocations and FreeBSD thread diagnosis

- Added checked ADRP/ADD and B/BL instruction relocations to ELF and Mach-O. Loader probes now use slide-invariant PC-relative addresses rather than absolute pointers embedded in executable text.
- Verification: missing instruction module and image fixup dispatch observed RED; 14 relocation/layout/signature tests GREEN. Linux ARM64 native loader revalidation is pending the next CI run.
- CI run 37232283290 passed Linux regression/compare and OpenBSD probes. Windows full check/compare is still running. FreeBSD LLDB stopped at `movq %r10,(%rax)`, the metadata write to the returned thread mapping's first page.
- Root cause confirmed in FreeBSD 14.3 mmap(2): MAP_STACK returns a guard at its base, and that guard cannot shrink below the configured minimum. Use a plain fixed-size private anonymous mapping for the runtime-owned stack and metadata; retain OpenBSD's required MAP_STACK. Native failure was reproduced before this fix; native revalidation is pending.

## Native revalidation (36c3831) and ARM64 CPU phase

- CI run 37232591028: FreeBSD and OpenBSD passed all ten JavaScript runtime probes. Linux x64/ARM64 and Darwin x64 loader probes passed with the new ARM64 PC-relative addressing. Linux regression/compare passed. Windows full `npm run check` and `npm run compare` passed (job 111525269902).
- Darwin ARM64 remains the known static-loader failure; the mandatory system-library policy exception is still awaiting the owner. No ARM64 compiler target is enabled yet.
- Added an A64 assembler lowering logical runtime registers to native ARM registers, with a runtime return-slot stack, checked native fixups, explicit raw-x64 rejection, saved condition flags/parity, integer shifts/multiply/128-bit divide, binary64 FP and conversions, atomics, fences and bulk memory.
- Encoding vectors were cross-checked against LLVM's primary AArch64 assembler test source. Each missing operation group was observed RED before implementation; focused assembler/relocation tests now pass (9 tests). This proves encoding/linking, not native execution.
- Added a Linux ARM64 CPU execution probe with Node BigInt arithmetic expectations and explicit exit-stage diagnostics. Native execution is pending CI; this commit is a reviewable integration checkpoint needed to dispatch that gate. Compiler factory dispatch remains disabled until the complete runtime is ready.
