# WebAssembly execution implementation plan

**Goal:** Implement step 2 of #667 against the pinned PGlite inventory.

**Architecture:** An original scalar WASM decoder, validator and interpreter live
in optional JavaScript preludes compiled by Nona into the executable. Existing
ArrayBuffer/DataView and BigInt primitives provide owned memory and exact i64;
ordinary traced objects retain instances, functions and reentrant call frames.
No external engine, interpreter process, library or compiler is introduced.

**Scope:** The owner's four-step plan and tests/fixtures/pglite/AUDIT.md are the
specification. Local asset loading and filesystem persistence belong to later
steps. Preserve this checkout/branch and run only targeted tests, sequentially.

- [x] Add self-contained binary fixture builders and native/Node execution tests;
      observe the missing WebAssembly failure.
- [x] Implement scalar numeric operations, strict binary decoding and typed
      validation, with structured control and all inventory instruction families.
- [x] Implement execution and branded Module/Instance/Memory/Table/Global APIs,
      asynchronous compile/instantiate, imports, traps, callbacks and growth.
- [x] Register optional linking and tests, including GC stress; document subset,
      ownership and lifetime. Run focused tests, build, format and document links.
- [x] Review the step and prepare the commit without pushing or opening a pull request.

Review focus: invalid section/LEB/type/index inputs; failed growth preserving
memory; signed/unsigned i64 boundaries; callback reentry and exceptions; indirect
call signatures and retained function identity across instances.

Verification on Windows x64, Node 26.9.0, with test concurrency 1:

- `npm run build` passed.
- `webassembly` and `webassembly-source`: 21 tests passed. Native cases include
  GC stress; the larger scalar edge matrix runs without it.
- ArrayBuffer/structuredClone `transfer|detachment` regressions: 5 passed.
- Runtime linking, library sources, source budget and suite registration: 20 passed.
- `npm --prefix tests/fixtures/pglite run validate:engine`: all 29 pinned modules
  validated by Nona's source decoder; metadata matched Node. This is source-level
  coverage, not native PostgreSQL execution.
- Changed-file Prettier and `git diff --check` passed. Document links passed
  after generating the checkout's missing `site/generated` reference pages.

The independent read-only review found three embedding/validation defects:
padded binary limits flags, overridden callback `.apply`, and noniterable
multivalue returns. Each was reproduced with a failing regression, fixed and
verified green. Full/long validation remains hosted; native Linux execution,
PGlite boot and persistent storage are not claimed by this step.

Commit handoff: staging failed because the sandbox cannot create
`clone/.git/worktrees/issue-667/index.lock` outside the writable checkout.
The implementation remains uncommitted. Intended commit message:
`Implement original in-process scalar WebAssembly runtime (#667)`.
The eventual PR needs `full-ci` and `gc-stress` before its CI-triggering push.
