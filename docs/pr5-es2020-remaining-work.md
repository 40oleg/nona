# PR #5: remaining work for the ES2020 0.6–0.16 gate

Snapshot: 2026-09-28, branch `work/v0.6-v0.14`. This is a work list, not a
claim of conformance. The normative target and exceptions are in
[`es2020-contract.md`](es2020-contract.md); the implementation matrix is in
[`language-support.md`](language-support.md). PR #5 must stay draft until
every applicable item below has implementation and conformance evidence.

## Verified baseline to preserve

- Pinned Test262 revision: `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`.
  Windows CI run `36471706841`: applicable Date **583/583**, JSON **142/142**,
  ArrayBuffer **82/82**, DataView **476/476**, TypedArray **1117/1117**,
  SharedArrayBuffer **59/59**, Reflect **152/152**, Promise **522/522**.
  Reports are uploaded separately as `test262-*-report` artifacts. The
  exclusions are encoded in `.github/workflows/check.yml` and cover newer
  APIs, documented `eval`/`Function` exceptions, or cross-realm cases.
- The same run's Linux native job passed. The broad Windows `npm run check`
  job was still running when this snapshot was written; inspect its final
  conclusion before using this run as a green baseline.
- These catalog passes do **not** prove the complete milestones. Tests of
  language syntax, host behavior, multiple agents, modules and interaction
  between built-ins remain outside these jobs.

## 0.6 — Object, Function, Boolean, Symbol, arguments, Error

- Audit complete applicable Test262 catalogs for each constructor, prototype,
  static method and property descriptor, including strict/sloppy calls, key
  order, coercion side effects and callbacks that trigger GC. Classify every
  failure against ES2020, a documented exception or a real defect.
- Implement and verify the four Annex B Object.prototype methods
  `__defineGetter__`, `__defineSetter__`, `__lookupGetter__` and
  `__lookupSetter__` (54 pinned Test262 files), or document an explicit
  host deviation under the contract. They are absent today. Check receiver
  coercion, callable validation before key conversion, single ToPropertyKey,
  accessor attributes, prototype traversal, Proxy traps and metadata.
- Recheck `Function.prototype.toString`, `bind`/`apply`/`call`,
  callable/constructable metadata and native method source after async,
  classes, Proxy, realms and RegExp are finished. The earlier full Function
  catalog had unclassified failures; targeted passing subsets are insufficient.
- Finish applicable Object, Symbol, Boolean, Error and arguments integration
  with Proxy and other realms. Keep post-ES2020 `cause`, `isError`,
  `dispose` and `asyncDispose` out of this gate only with explicit
  per-file exclusions. See the 0.6 notes in
  [the roadmap](release-roadmap-0.4-0.20.md).

## 0.7 — Date and JSON

- Preserve the full applicable Date 583/583 and JSON 142/142 CI results.
  Define and test the host policy for local time, time zone and clock on both
  Windows and Linux; compare parse/format/calendar boundary behavior under
  controlled time zones. Exercise GC and user callbacks in reviver, replacer
  and `toJSON`.
- Add realm support and repeat the currently excluded cross-realm Date/JSON
  files. Repeat language-level JSON and Date interactions, not just their
  built-in directories. `JSON.rawJSON` and parse-with-source are later APIs.

## 0.8 — BigInt and numeric semantics

- Repeat the applicable `built-ins/BigInt`, BigInt language, numeric
  conversion and BigInt typed-array catalogs after realms and remaining
  constructor integration. The prior BigInt catalog was 76/77; the last file
  requires another realm. Cover Number/BigInt mixed operators, shifts,
  boundary values, error order, JSON and GC on both targets.
- Audit remaining Number/Math accuracy and formatting boundaries called out
  in [the support matrix](language-support.md), including very large finite
  inputs and side effects of conversion.

## 0.9 — RegExp engine

- Complete ES2020 pattern grammar and early validation for literals and
  `RegExp` construction: escapes, Unicode case folding, classes, named
  captures, lookbehind and backtracking order. Repeat all applicable
  recursive RegExp/Test262 directories, not only selected methods.
- Finish the pinned generated Unicode property escape catalog, record every
  exclusion, and make pathological patterns and multi-worker stress runs
  reliable within an explicit resource policy. Large generated tests still
  expose slow string construction and VM performance. See
  [the RegExp status](v0.9-regexp-status.md).

## 0.10 — RegExp and String integration

- Repeat applicable `@@match`, `@@matchAll`, `@@replace`, `@@search`,
  `@@split` and corresponding String methods after the RegExp engine,
  realms and Proxy settle. Check symbol hooks, custom `exec`, species,
  replacement tokens, zero-length Unicode matches, iterator closing,
  side-effect order and GC. Classify the older `eval`, later `v`-flag and
  cross-realm failures per file. See
  [the integration status](v0.10-regexp-string-status.md).

## 0.11 — ArrayBuffer, DataView and typed arrays

- Keep the current applicable Windows CI baselines (82/82, 476/476,
  1117/1117) and add equivalent Linux native semantic/GC coverage. The
  long `copyWithin` cases require the recorded 600-second runtime limit;
  optimize them without weakening their assertions.
- Add realm support and rerun excluded cross-realm/species/constructor
  interactions. Recheck detachment, bounds, overflow, BigInt element
  conversion, Proxy receivers and callbacks after later milestones change
  their dependencies. See [the buffer status](v0.11-buffers-status.md).

## 0.12 — SharedArrayBuffer and Atomics

- Replace per-process GC-heap bytes with a shared backing store whose
  lifetime is safe across agents and on Windows/Linux. Preserve aliasing
  between all views and safe GC ownership. The current 59/59
  SharedArrayBuffer catalog tests only single-agent semantics.
- Specify and implement the host agent protocol used by Test262:
  `$262.agent.start`, `broadcast`, `getReport`, `report`, `sleep`,
  `leaving`. Compile and launch agent programs, transfer the same shared
  backing store, and collect deterministic reports and failures.
- Implement an atomic waiter registry keyed by backing store and byte offset:
  registration, count-limited FIFO notification, timed removal, spurious
  wakeup handling and exact return values. `Atomics.notify` currently
  returns zero without waking anyone; `Atomics.wait` calls OS waits without
  this registry. Fix Linux BigInt64 waits, which currently compare only the
  low 32 bits in the futex shim.
- Run full applicable Atomics/SharedArrayBuffer Test262 agent tests and
  independent multithreaded native tests on both operating systems, including
  races, timeouts, `not-equal`, notification count and GC. See
  [the shared-memory status](v0.12-shared-memory-status.md).

## 0.13–0.14 — Map, Set, WeakMap, WeakSet

- Reclassify and rerun complete applicable Test262 catalogs after Proxy and
  realm support. Verify insertion order, iterator mutation, SameValueZero,
  constructor iterator closing, species/metadata, abrupt callbacks and GC.
  Keep later Set methods, WeakRef and other post-ES2020 APIs explicitly
  excluded, rather than counting their accidental passes.
- Prove weak reachability and ephemeron fixpoint behavior with cycles and
  mutation under GC stress on Windows and Linux; repeat memory-growth tests.
  See [collections](v0.13-collections-status.md) and
  [weak collections](v0.14-weak-collections-status.md).

## 0.15 — Proxy and Reflect

- Reflect's applicable built-in catalog passes 152/152, but the full Proxy
  catalog previously gave 263 pass / 47 fail / 1 skip: 37 failures require
  other realms, nine use missing `with`, one uses the documented `eval`
  exception; the skip requires modules. Implement those missing language
  facilities and rerun the catalog and all previously deferred interactions.
- Audit every Proxy internal trap and invariant, nested/revoked proxies,
  callable and constructable proxies, arrays, typed arrays, RegExp, class
  methods, abrupt completion and GC. Implement multi-realm intrinsics and
  `$262.createRealm` for the runner so cross-realm tests execute rather
  than being silently excluded. See [Proxy](v0.15-proxy-status.md) and
  [Reflect](v0.15-reflect-status.md).

## 0.16 — Promise and asynchronous language

- Keep Promise's applicable built-in catalog 522/522 and explicit host
  unhandled-rejection policy. Audit job ordering, thenable assimilation,
  cycles, species, combinators, mutable intrinsics, GC and standalone exit
  behavior on both targets.
- Implement async functions, `await`, async generators and async iteration
  in the frontend, IR and runtime. Then run applicable Test262
  language/job/async catalogs, including rejection timing and iterator
  closing. Add cross-realm Promise tests once realms exist. See
  [the Promise status](v0.16-promise-status.md).

## Cross-cutting ES2020 contract and final PR gate

- Implement sloppy-script `with` using object environment records,
  `Symbol.unscopables`, nested closure capture and proper abrupt completion;
  reject it in strict mode. The pinned `language/statements/with` directory
  has 181 files. Audit lexical grammar, ASI, declarations, references,
  coercion, statements, classes, functions, destructuring, templates,
  iterators and generators through applicable full language catalogs.
- Implement modules: parsing/linking of multiple files, live bindings,
  cycles, errors, `import.meta`, dynamic import and a documented host
  resolver. Implement proper tail calls in strict code with bounded native
  stack use. These are marked **Missing** in the contract.
- Establish cross-realm creation and lifetime for intrinsics and objects;
  add `$262.createRealm` and needed harness operations. Specify behavior
  of the intentional `eval` and dynamic `Function` exceptions, test their
  syntax/metadata, and label the release “ES2020 with documented exceptions”.
  Track Annex B script-host deviations explicitly.
- For **every** contract row, collect pinned applicable Test262 pass/fail/skip
  counts with a per-file reason for exclusions, targeted side-effect/GC
  tests, and Windows **and** Linux native evidence. Update README, support
  matrix and development log from those verified results. Run the complete
  CI workflow on the final commit, resolve every failure, review the diff,
  update the PR body and only then mark PR #5 ready for review. Do not infer
  the entire gate from the currently green built-in subsets.
