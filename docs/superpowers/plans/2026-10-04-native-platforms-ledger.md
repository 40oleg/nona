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
