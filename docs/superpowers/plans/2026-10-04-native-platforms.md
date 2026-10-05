# Native Platforms Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Track progress with the ledger and checkbox steps.

**Goal:** Implement and verify the eight targets from issue #117, then prepare an unmerged PR.

**Architecture:** Shared frontend/IR/runtime semantics, native x64 and ARM64 emission, OS service adapters, and PE/ELF/Mach-O layout. Existing x64 behavior remains the regression baseline.

**Tech Stack:** TypeScript, Node.js 26, direct machine-code emission, GitHub native runners and BSD VM actions.

**Spec:** `docs/superpowers/specs/2026-10-04-native-platforms-design.md`.

## Global Constraints

- Targets: win32-x64, linux-x64, darwin-x64, darwin-arm64, linux-arm64, win32-arm64, freebsd-x64, openbsd-x64.
- No C/LLVM toolchain, bundled runtime, or interpreter dependency in output. The owner authorized macOS system libSystem for native startup and OS services on 2026-10-05; other targets remain libc-free.
- No generated Windows executable execution on the local maintainer host.
- No main push, merge, security-policy changes, WSL installation, or global Node switch.
- Write repo artifacts in English, commit as helgus, retain issue #117's claim.

## Review Focus

- Unsupported host/architecture must not silently select win32-x64.
- Target and architecture must invalidate cached runtime/prelude images.
- Coroutine stack changes must preserve managed roots and return addresses.
- CPU flags, NaN/overflow conversions, and syscall errors must preserve semantics.
- Output signing/permissions and relocation bounds must survive native loaders.

## Task 1: Target registry and integration boundary

Files: `src/target.ts`, `src/compiler.ts`, `src/cli.ts`, `src/frontend/builtin-modules.ts`, `tests/native-targets.test.ts`.

Interfaces: `Target`, `TargetDescriptor`, `getTarget(target)`, `detectHostTarget(platform,arch)`; descriptors expose OS, CPU, format, and executable-file behavior. `compile` keeps returning positioned diagnostics for unsupported options.

- [x] Test that native-target detection distinguishes linux/arm64, darwin/x64 and arm64, win32/arm64, and BSD/x64, and returns undefined for unsupported combinations.
- [x] Observe the missing behavior fail, implement registry/integration, and prove the original targets still emit identical metadata and reject invalid targets.
- [x] Test PE-only option rejection and target-dependent built-in module platform/arch values.
- [x] Commit after the focused build/tests pass; record evidence in the ledger.

## Task 2: ELF and BSD x64

Files: `src/backend/elf/writer.ts`, `src/backend/bsd/`, `tests/elf.test.ts`, `tests/native-targets.test.ts`.

Interfaces: `linkElf(program, options)` accepts machine/OS layout; `linkBsd(program, target)` resolves imports and required metadata without libc.

- [x] Pin ELF machine, OS identification, entry/fixup bounds, and syscall-entry requirements with failing tests.
- [x] Implement writer parameters and BSD memory/IO/exit/clock services using authoritative syscall definitions.
- [x] Add native VM probes for arithmetic, strings, closures, arrays, GC, clocks and IO; implement wait/wake/thread services before labeling the target verified.
- [x] Run focused local layout tests and BSD VM gates; commit verified changes and record failures by target.

## Task 3: Mach-O x64

Files: `src/backend/macho/`, `src/backend/darwin/`, `tests/macho.test.ts`, platform probe scripts.

Interfaces: `linkMachO(program, options)` writes checked segment/entry/signature metadata; `linkDarwin(program,target)` supplies Darwin services.

- [x] Add failing end-to-end compile/layout assertions for darwin-x64, permissions, entry addresses, and invalid imports/fixups.
- [x] Implement Mach-O layout and Darwin startup/memory/IO/clocks without libSystem calls for core runtime services.
- [x] Execute representative binaries on the Intel macOS runner; resolve loader and service failures before continuing.
- [x] Extend probes to coroutine/async and thread behavior, then commit with exact evidence.

## Task 4: Shared emission and raw-operation isolation

Files: `src/backend/x64/assembler.ts`, `src/backend/machine/`, `src/runtime/abi.ts`, raw-operation call sites in runtime/codegen, `tests/assembler.test.ts`.

Interfaces: named semantic operations for sign extension, setcc/zero extension, timestamps, syscalls, and mathematical primitives; architecture-scoped assembler creation restores its previous context on exit.

- [x] Capture x64 byte/semantic baselines and test scoped context restoration after nested calls and exceptions.
- [x] Isolate raw CPU operations without changing x64 bytes; keep label/fixup offsets stable.
- [x] Verify old assembler/ELF/PE suites plus Linux native regression; commit the compatibility layer.

## Task 5: ARM64 integer, FP, call, and stack emission

Files: `src/backend/arm64/`, shared assembler facade, `tests/arm64-assembler.test.ts`.

Interfaces: ARM64 emitter implements the shared runtime operation API and produces NativeProgram fragments with checked literal-address/branch fixups.

- [x] Add red encoding tests for loads/stores, arithmetic, comparison/flags, branches, address formation, integer division/high multiply, and FP conversions.
- [x] Implement lowering and logical-register mapping; include overflow/NaN/negative-zero and address-range tests.
- [x] Add call/return, indirect calls, frame, and suspended-stack tests; keep the platform ABI stack aligned independently of runtime slots.
- [x] Add atomics/fences and bulk-memory tests, including real shared-memory execution on the Linux ARM64 runner.
- [x] Commit only after the focused encoding and native Linux ARM64 probes pass.

## Task 6: ARM64 mathematical helpers and runtime

Files: ARM64 numeric helpers, runtime Math/numeric call sites, `tests/arm64-runtime.test.ts`, third-party notices if algorithms are imported.

Interfaces: self-contained binary64 helpers replace x87-only operations when the selected architecture is ARM64.

- [x] Add failing native cases for trigonometry, log/log1p, exp/expm1, atan/atan2, powers, and domain/Infinity/negative-zero boundaries.
- [x] Implement numerical helpers with checked argument reduction and documented source/licenses; retain x64's original path.
- [x] Run existing Math/numeric/GC/generator/async suites on Linux ARM64 and inspect oracle tolerances by operation.
- [x] Verify architecture-specific cache identity and isolation; commit runtime coverage and evidence.

## Task 7: macOS and Windows ARM64

Files: Mach-O signing/layout, PE ARM64 layout, platform ABI adapters, ARM64 OS services, format tests.

Interfaces: Mach-O emits an embedded ad-hoc signature over the final image; PE resolves ARM64 imports/relocations and typed native-call bridges.

- [x] Pin CPU headers, final-image signature hashes, malformed metadata, and unsupported ABI option behavior with failing tests.
- [ ] Implement Darwin ARM64 startup/syscalls/signing and execute on Apple Silicon CI.
- [x] Implement Windows ARM64 platform-call bridge and PE metadata; execute on windows-11-arm CI.
- [ ] Run managed-runtime, GC, coroutine, timers/IO, and agent probes on both targets; commit after gates pass.

## Task 8: CI and distro verification

Files: `.github/workflows/native-platforms.yml`, `scripts/build-platform-probes.mjs`, `scripts/run-platform-probes.mjs`, Linux container matrix and BSD VM execution scripts.

Interfaces: generated probe manifests identify target/CPU and oracle outputs; runners reject a mismatched host instead of emulating another CPU silently.

- [x] Add explicit host/target mismatch and failing-probe diagnostics to the runner tests.
- [ ] Verify eight native target gates, existing regression, and Linux distro compatibility without compiling separately per distro.
- [ ] Confirm OS/kernel floors from the syscall adapters and record native versus format-only/emulated evidence separately.

## Task 9: Documentation, review, and PR

Files: README.md, README.ru.md, docs/native-platforms.md, docs/host-apis.md, CHANGELOG.md Unreleased, applicable site pages/translations.

- [x] Document target names, cross-compilation, ABI/capability limits, verified OS floors, and actual CI results.
- [x] Run required existing build/regression/compare gates in CI and enabled-platform gates; review the entire diff and resolve concrete failures. The eighth target remains tracked in Tasks 7/8.
- [x] Open and attach the PR with `Closes #117`, design, verification, and limitations; leave it unmerged and do not push main. Draft PR #122 records the unresolved Apple Silicon decision.
- [ ] Mark the goal complete only after the requested platform work and reviewable PR are actually finished.
