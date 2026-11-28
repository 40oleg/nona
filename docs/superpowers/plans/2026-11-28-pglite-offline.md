# PGlite offline boot implementation plan

**Goal:** Implement step 3 of #667 using the unchanged pinned PGlite 0.3.14 package.

**Specification:** The owner's step 3 instructions and the fixture's AUDIT.md.
The provided plan authorizes inline execution in this existing worktree.

**Architecture:** A fixture adapter accepts an explicit asset directory, reads
and verifies the two pinned resources, compiles the exact WASM byte view and
supplies `wasmModule` plus a Blob `fsBundle`. The audited Node detection is
adapted only while creating the database and restored on success or failure.
General module/runtime gaps exposed by the unchanged package get small regression
tests. Persistence and COPY remain step 4.

- [x] Add a failing native integration test compiling the actual package; run
      from an isolated directory containing only the executable and local assets.
- [x] Implement the adapter and scoped platform handling; reproduce and repair
      any module/prelude compatibility gaps with focused regressions.
- [ ] Check SELECT 1, awaited close, absent fetch, missing/truncated/corrupt WASM,
      and missing/corrupt data, with bounded child execution and path diagnostics.
- [ ] Register mandatory hosted Linux coverage; document invocation and resource
      ownership/contract, format and run relevant tests serially, then commit.

Review focus: pooled Buffer offsets and lengths; failure restoring platform
state; modified companion data with unchanged size; pending readiness promises;
runtime independence from package sources and the original working directory.

Validation stays targeted, concurrency 1, with no long/full local suites.
Linux execution requires hosted CI because this Windows host has no WSL distro.
