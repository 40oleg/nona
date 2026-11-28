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
- [ ] Record hosted native SELECT 1, awaited close and absent fetch acceptance.
- [x] Check missing/truncated/corrupt WASM and missing/corrupt data, with bounded
      standalone native execution and resource path/cause diagnostics.
- [x] Register mandatory hosted Linux coverage; document invocation and resource
      ownership/contract, format and run relevant tests serially, then commit.

Review focus: pooled Buffer offsets and lengths; failure restoring platform
state; modified companion data with unchanged size; pending readiness promises;
runtime independence from package sources and the original working directory.

Validation stays targeted, concurrency 1, with no long/full local suites.
Linux execution requires hosted CI because this Windows host has no WSL distro.

## Continuation evidence (2026-11-28)

- The unchanged package completed SELECT/awaited close with Nona's WASM source
  engine running in Node: 95.6 seconds, status 0, empty stderr and
  `select=1 closed=true fetch=undefined`. This is source-engine evidence, not
  native acceptance.
- The standalone Windows executable did not complete SELECT/close within the
  original 600-second bound (`ETIMEDOUT`). All five resource-failure cases passed
  in that run. Do not report native boot as passing on this evidence.
- Ruling: keep long native boot on GitHub-hosted runners and allow thirty
  minutes for that child, forty for its workflow step. The original bound was
  insufficient on the shared Windows host. The underlying reason for native
  noncompletion remains unconfirmed; hosted boot must still pass. Preserve the
  fifteen-second resource-failure bound and expose local boot as an explicit skip.
- The revised local `pglite` suite passed ten tests with one explicit hosted-only
  skip. Both `createRequire` regressions passed. All 21 WASM source/native
  regressions passed with test concurrency 1.
- Cross-compiling the actual package produced a 27,398,144-byte Linux x64 ELF;
  its ELF64 header and x86-64 machine ID were checked. It was not executed here.

Native Linux SELECT/close remains a required, unverified hosted acceptance case.
Persistence and binary COPY remain step 4. No push or PR is part of this task.
