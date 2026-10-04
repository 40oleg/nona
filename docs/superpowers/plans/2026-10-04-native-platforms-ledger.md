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
