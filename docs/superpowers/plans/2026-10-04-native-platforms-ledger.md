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

## ARM64 native CPU evidence (fff3f2e) and software math checkpoint

- CI run 37233091626: Linux ARM64 CPU probe passed (job 111526724496), including overflow/carry/parity, signed/unsigned comparisons, variable shifts, full 128-bit division, multiplication, FP/NaN conversion, atomics and internal calls. Both BSD targets, Linux regression/compare and Darwin x64 loader passed again. Windows full regression is still running at this checkpoint.
- Extended the CPU probe with native syscall marshaling, import-cell calls, timestamps, memory increments, signed wide division, byte/word/dword atomics and flags-preserving zero shifts. Focused assembler/x64 tests passed (18); the extended native gate is pending.
- Ruling: enable internal ARM64 assembler factory dispatch now, before the full compiler target, because self-contained math/runtime emission needs that scope. Public `compile(..., target: *-arm64)` remains explicitly disabled; raw x64 operations still throw. Factory dispatch test observed RED then GREEN, and target/cache/BSD cross-scope tests passed (14).
- Added self-contained logarithm/exponential helpers using range reduction and convergent series, with Sun fdlibm/OpenLibm constant attribution and notice. Added Node-oracle native probes including signed zero, subnormals, overflow/underflow, infinities and NaNs. Missing helper/probe assertions observed RED, focused math/CPU/context tests GREEN (9); accuracy/execution still await CI.
- CI cadence ruling: incremental branch pushes run targeted Linux regressions and native probes; full Windows check/compare runs on manual dispatch and PR events. Scope concurrency by commit so a new development checkpoint does not cancel an already-running full regression. Run a complete manual gate on the final head before PR readiness; earlier green evidence does not replace that gate.

## ARM64 extended CPU and log/exp native evidence (05356e2)

- CI run 37233682546, job 111528469486: both the extended CPU probe and log/exp Node-oracle probe passed on Linux ARM64. This covers signed 128-bit division, 8/16/32-bit atomic flags and partial results, imported internal calls, native syscall marshaling, timestamps, preserved carry on memory increments and zero-count shifts, and log/exp's subnormal/non-finite/boundary cases.
- Added log1p/expm1 cancellation handling and tiny-input/signed-zero preservation, plus sin/cos/tan polynomial kernels using the existing 1152-bit reciprocal argument reducer. Missing helper assertions observed RED then GREEN; helper/probe layout tests and image construction pass. New native numerical gates are pending this checkpoint's push.
- Native math oracle checks now require exact signed-zero/Infinity/NaN classification and exact smallest-subnormal results, with finite relative tolerances elsewhere. None of this enables a public ARM64 compile target before the remaining runtime/math/OS services are complete.

## Windows regression diagnosis (fff3f2e)

- Job 111526724358 finished with 2295 passed, 65 skipped and one failure: existing CLI locked-output test's PowerShell lock helper timed out before signaling readiness. This is a startup timeout, not a failed executable-output or compiler assertion. Do not dismiss it without an isolated rerun.
- Added a manual `cli` diagnostic scope to the native workflow, preserving the default full check/compare gate. Run that scope on the current branch, then require the complete full scope on final head before PR readiness. Earlier full Windows check/compare success remains recorded separately.

## Native math and isolated CLI evidence (65c48f7)

- Manual diagnostic run 37233928827: Windows CLI suite passed, including the previously timed-out locked-output test (job 111529196090). The failure occurs under the full-suite load and was not reproduced in isolation; do not change compiler behavior or weaken the output-preservation assertion. A final full Windows gate is still required.
- Linux ARM64 loader/CPU/math gates passed (job 111529196126), now including log1p/expm1 cancellation/tiny-input cases and sin/cos/tan with 1e300 arguments. This confirms the shared reciprocal argument reducer also works for the moderate arguments used by ARM64.
- Added atan/atan2 range reduction and series, with quadrant/non-finite/zero handling and Node-oracle cases. Missing-helper assertion RED then focused tests GREEN; native validation is pending this checkpoint's push.

Task 6 checkpoint: ARM runtime/prelude emission RED (raw x87 instructions) -> GREEN by dispatching all x87 math/power paths to native ARM helpers; 25 focused compiler/assembler/cache/BSD tests passed. Native atan/atan2 oracle passed in run 37234105952 job 111529694160. Native execution of the complete ARM JavaScript runtime remains pending.

Task 5/6 checkpoint: Linux ARM64 compilation and ten full-runtime probe generation assertions RED E_TARGET -> GREEN after asm-generic syscall adaptation, architecture-scoped ELF linking and runtime probe integration. Forced GC and agent images now generated; native CI execution is the next gate. Ruling: temporarily reject process on Linux ARM64 until architecture-specific host declarations are implemented, avoiding x64 syscall numbers and false process.arch; this costs reduced host API availability during development. Syscall numbers verified against Linux v6.18 include/uapi/asm-generic/unistd.h.

Native ARM runtime first run 37234550842: math kernel probe filename collided with the new compiled-JS math probe; native math executable itself returned the correct JS output but the manifest still expected hello. Renamed the kernel executable to math-kernels; no oracle expectation weakened.

Linux ARM64 host APIs: process syscall/signature and filesystem generation tests RED -> GREEN. Added openat/readlinkat/mkdirat/unlinkat/newfstatat/renameat2 boundaries and asm-generic stat mode offset 16, verified against Linux v6.18 stat.h. Removed temporary process guard; process architecture comes from target-specific prelude. Native process/filesystem lifecycle probes added; actual execution pending CI.

Native run 37234615387 job 111531137323 passed Linux ARM64 loader, CPU, math kernels and all ten compiled-JS probes including forced GC, generators, async/timers and real concurrent agents. Extended host test linking to choose CPU, replaced raw x64 GC test entry composition with semantic assembler (x64 initializeStack remains no-op), and queued the existing Math/numeric/GC/generator/async/Promise/Atomics/process/fs suites plus all Linux example comparisons on ARM64 CI.

Linux ARM filesystem native failure localized to scandir EINVAL after all prior write/copy/rename operations passed. AArch64 asm/fcntl.h overrides O_DIRECTORY to octal 040000 (0x4000), whereas x64 uses 0x10000. Corrected architecture-specific source constant; native lifecycle probe supplies the RED case.

Task 3 checkpoint: Darwin x64 compile/runtime probes RED E_TARGET -> GREEN generation with direct Darwin mmap/IO/clock/sleep/ulock/bsdthread services and carry-error normalization. Intel monotonic nanotime follows XNU commpage generation/scale/shift fields; native execution pending. Thread registration/create/entry follows Apple libpthread kern_support.c kernel ABI; no library linked. Process/filesystem still explicitly rejected until their native adapter is implemented.

Task 3 native evidence: run 37234983689 job 111532184124 passed Darwin x64 loader and all ten JavaScript/runtime probes including real threads. Task 7 checkpoint: Windows ARM64 typed bridge/machine/relocation tests RED -> GREEN; added native callback frame and Windows ARM64 CI loader/runtime gate. Ruling: ARM PE omits x64-only unwind metadata, since it describes logical frames on a separate runtime stack, not physical A64 frames. Hardware exception stack unwinding across generated ARM code remains unsupported; emitting wrong-ISA unwind data would be incorrect. Native Windows execution pending CI; no local PE execution performed. ABI referenced Microsoft ARM64 Windows ABI conventions.

Linux ARM64 broad oracle run 37234983689: 148/152 passed. Two actual failures were small integral powers (2**3 produced 7.999999999999998 through log/exp); added an ARM integral exponent squaring path, reciprocal base first for negative exponents to retain subnormals. Two test-composition defects were hardcoded process.arch x64 and linking an ARM-generated image with the x64 PE linker; corrected expected host architecture and explicitly scoped the dual-x64-format composition. Native RED cases retained in existing tests; subsequent CI supplies GREEN.

ARM64 page geometry assertions RED 4096 -> GREEN: Linux ARM guard/large mmap lengths round to 64 KiB, valid on 4/16/64 KiB kernels; Darwin ARM guard uses 16 KiB. Existing x64/Windows guard stays 4 KiB. Native 64 KiB-kernel execution has not been performed; loader/runtime arithmetic alignment is checked, 4 KiB ARM runner gates remain required.

Windows ARM64 first loader CI failed before native execution: spawn ENOENT because the binary lacked .exe and Windows process creation appended that suffix. Added .exe filenames for Windows manifest probes; the runner accepts only a basename with optional .exe. No Windows binary executed locally.

Linux ARM64 repeat: all 152 runtime oracle tests passed, native typed-import bridge probe passed, filesystem lifecycle passed. Example comparison found only Math.exp(1) off by one ulp. This also occurs in OpenLibm e_exp.c, which returns the correctly rounded e for x==1; added that mathematical constant path and exact native exp(1) oracle assertion. All other comparison expectations remain unchanged.
Windows ARM64 run 37235524984 job 111533725601 passed loader and all ten native JS/GC/async/timer/agent probes.

Browser compiler build RED: the Mach-O writer transitively imported node:crypto with no browser shim. Replaced hashing with synchronous FIPS SHA-256; 11 independent Node hash/Mach-O signature/Windows ARM/filesystem/probe tests passed, browser bundle build GREEN. Local playground parity: scripts passed, two module fixtures differ because Windows resolves /app.mjs to /C:/app.mjs while the browser uses /app.mjs; Linux CI parity remains the verification gate. Windows ARM filesystem import assertion corrected for the existing lowercase DLL spelling (Windows DLL identity is case-insensitive); no executable was launched locally.

Native run 37236036360: Windows ARM64 passed all 142 shared runtime and 10 process/filesystem tests plus native contention probes (job 111535204281); Linux ARM64 passed the same suites and Node example comparisons. Five Linux distributions and both BSD VMs passed. Darwin Intel contention returned before all workers completed. Hypothesis: the current __semwait_signal call with a null conditional semaphore does not block. Added a 30 ms Sleep probe with a monotonic >=20 ms assertion before replacing the syscall; native diagnostic run required. No timeout or expected counter was relaxed.

Sleep diagnostic run 37236575542 job 111536755604 confirmed native Darwin RED: true true false after requesting 30 ms and checking >=20 ms. The first diagnostic had omitted the agent intrinsic (runtime error on every target); fixed test composition before interpreting the result. Replaced null-semaphore waiting with poll_nocancel(0,0,ms), whose XNU sys_generic.c explicitly supports zero descriptors and respects the timeout. Signed-int timeout limits are handled with bounded chunks. Native revalidation pending.
FFI Darwin class/diagnostic assertions RED -> GREEN; raw BSD/Darwin failures now normalize carry-set errno to a negative result. Added actual getpid and EBADF native probes for every enabled POSIX target. Focused build/probe/FFI tests passed (8), no binaries executed locally. Updated READMEs, capabilities/FFI docs, CLI/API references, guide/reference translations and site matrix page. VitePress build and 452 repository links passed. Browser parity remains a Linux CI gate; new dedicated workflow job checks build/parity/samples/links.

Whole-branch fresh review (base569270a through0ff71f1): reviewer ran31 pure tests and identified P2 WriteConsoleW missing its fifth native argument and P3 unaligned ARM ELF/PE entries. Both reproduced RED in pure regression tests; one fix pass added WriteConsoleW arity5 and explicit entry alignment checks. The full33-test review set passed GREEN. The native Windows ABI probe now calls a named WriteConsoleW callee exposing x4, with logical rbp deliberately nonzero; native validation pending. No additional concrete defects were found by review; macOS ARM policy remains unresolved.
Ruling: broaden new-port native oracle coverage to30 existing Date/buffer/Unicode/RegExp/collection/object suites — these exercise paths beyond the earlier142 math/GC/async tests; no extra local native execution. Browser compiler CI passed at0836344 (job111537799008). Ruling: native runners build probes only for their exact target, preserving default all-target generation for developers — avoids redundant cross-platform compilation on every runner. Selected LinuxARM manifest verified17runtime/ABI probes without execution. Manual regression uses a separate event concurrency key and only the Windows full/CLI gate; push/PR gates own the native/site matrix, avoiding duplicate work or mutual cancellation.

Expanded Linux ARM suite at79100bc (job111538403612):721/733 passed; all12 failures were object-error tests compiling win32-x64 explicitly, then trying to spawn a PE on Linux (EACCES). Corrected those tests to hostTarget without changing the expected runtime error/status. This also removes accidental x64 emulation for those12 tests on WindowsARM.
Additional CPU inspection found narrow XADD flags included discarded source high bits. Added native8/16/32-bit vectors; run37237507381 job111539473990 reproduced RED at stage50 (first byte carry assertion). Mask the source to operation width before arithmetic; preserve the original destination high bits when returning byte/word results. Focused12 assembler/bridge/layout tests passed; native GREEN remains required. This is a later diagnostic bug fix, not a second whole-branch review round. New namedWriteConsoleW ABI probe passed natively before the CPU RED in the same job.
Documentation correction: translated CLI/API tables now state host OS/CPU defaults and link the complete target matrix rather than retaining the old win32-x64 default. Package metadata updated; VitePress build and452links passed.

Windows ARM expanded suite at 79100bc (job 111538403591): 731/733 passed; two Date oracle comparisons inherited the runner's non-UTC timezone, whereas Nona's existing local-time policy is UTC. This also explains year/day boundary differences on Intel macOS runners using local time. Added an optional timezone to the Node oracle and explicitly selected Etc/UTC only for Date tests. Independent Node-only regression reproduced RED (480 -1 instead of 0 0), then both oracle tests passed GREEN; parent timezone is restored. Runtime semantics and assertions remain unchanged. Node's primary CLI documentation confirms TZ support on Windows and POSIX. Native Date revalidation remains required.

Intel macOS expanded suite at 79100bc (job 111538403539): 716/733 passed; 12 object cases were the already-corrected PE test composition, and five reflection cases requested process indirectly because the lexer conservatively included every prelude for getOwnPropertyNames/ownKeys. Reproduced E_HOST_MODULE in a compile-only regression before the fix. Scoped usage collection now omits unavailable process only for implicit reflection selection; explicit process names, imported modules, eval sources and fullRuntime still diagnose the unavailable adapter. Focused compiler/context/oracle tests: 11 passed. Added reflection to the existing closure probe so both BSD VMs and all enabled native runners revalidate it. Native expanded-suite GREEN is still required. Whole-branch review remains the single completed review; these are later CI diagnostic fixes.

Linux ARM native GREEN at b21cf1a (run 37237689980, job 111539993148): ABI bridge and CPU vectors passed, including the discarded-high-bit narrow atomic cases. All 142 core runtime, 733 portable library and 10 process/filesystem tests passed, followed by Node example comparisons. Full Windows at 79100bc (run 37237143120, job 111538432658) passed npm run check: 2314 passed, 65 skipped, zero failed; npm run compare also passed. Superseded incomplete manual gates were cancelled after starting a final-head gate; cancelled runs are not passing evidence.

Ruling: synchronize the issue branch with main 64b3c5f (PR #120 / issue #119 property-index fix) before opening the PR. Merge preserves published branch history; main is not modified. Resolved only the overlapping Unreleased changelog entries, preserving both. Build and nine focused compiler/context tests passed after the merge. Add main's existing property-index/dense-elements regression to the new-port portable suites (now 734 tests) because its fix changes shared runtime code. Re-run native and full regression gates on this integrated head; earlier-head evidence is retained separately.
