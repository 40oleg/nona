# PR #5: remaining work for the ES2020 0.6–0.16 gate

Snapshot: 2026-09-28, branch `work/v0.6-v0.14`. This is a work list, not a
claim of conformance. The normative target and exceptions are in
[`es2020-contract.md`](es2020-contract.md); the implementation matrix is in
[`language-support.md`](language-support.md). PR #5 has been merged for the
experimental v0.6.0 subset release. The dated sections below preserve the
implementation/audit history; the full ES2020 gate remains open until every
applicable item has implementation and conformance evidence. See
[the v0.6 release status](v0.6-status.md) for the release boundary.

## Test262 audit 2026-09-30 (Linux x64 and Windows x64)

Full catalogs at the pinned revision with `TEST262_EXCLUDE_FEATURES=post-es2020`
(see [test262.md](test262.md)). "eval" = the documented `eval`/dynamic-source
exception (files that call `eval`, `$262.evalScript`, or build Function/
generator sources from non-literal strings); "post" = post-ES2020 semantics
that Test262 still tags with older features (for example the ES2021 typed
array [[Set]]/[[GetOwnProperty]] changes, the `v` RegExp flag, `Error.prototype.stack`).

Linux x64 (full catalogs at `c6c3b5b`):

| Catalog | Pass/applicable | Remaining failures |
| --- | --- | --- |
| `language/` (all 28 directories) | 16514/17337 (26 skipped) | 801 eval (335 in `eval-code`), 6 post, 16 other (below) |
| `built-ins/` (51 ES2020 directories) | 15245/15416 | 46 eval, 48 post, 77 other (below) |
| `built-ins/Atomics` (agents) | 268/268 | 2 `CanBlockIsFalse` files skipped |
| `annexB/` | 518/1016 | 488 eval (469 in `annexB/language/eval-code`), 10 other (below) |

Windows x64 (Node 22 host; native PE executables; full catalogs at
`c6c3b5b`, then the directories touched by later fixes rerun at `1d60f2f`:
`language/expressions/dynamic-import`, `language/statements/with`,
`language/types`, `built-ins/TypedArrayConstructors`, `built-ins/TypedArray`,
`built-ins/Reflect`, `built-ins/Proxy`, `built-ins/Array/from`). The unit
suite passes on Windows except three files whose expected output comes from
the Node 22 oracle (`object-collections` function metadata order,
`string-replace`/`string-split` primitive `Symbol.replace`/`Symbol.split`
getters), which CI runs on Node 26. PE, CLI, standalone and runtime-io tests
pass there.

| Catalog | Pass/applicable | Remaining failures |
| --- | --- | --- |
| `language/` | 16516/17337 (26 skipped) | 801 eval, 6 post, 14 other |
| `built-ins/` (every directory with applicable files) | 15433/15554 | 46 eval, 14 post, 61 other |
| `built-ins/Atomics` (agents) | 268/268 | 2 `CanBlockIsFalse` files skipped |
| `annexB/` | 518/1016 | 488 eval, 10 other |

Windows and Linux agree file by file except runner timeouts under load
(Linux: `Array.prototype.concat_large-typed-array`, two RegExp escape
sweeps). The Linux `Error` report predates excluding the post-ES2020
`error-stack-accessor` feature, so its 34 `Error.prototype.stack` files are skipped on Windows. A
Windows-only runner defect (computed `import()` fixture candidates did not
read `/C:/...` module paths) was fixed in `scripts/test262-smoke.mjs`.

Built-in residuals classified per file: `Function` 32 build sources from
non-literal strings (documented exception), 4 need Function constructors of
another realm; `TypedArrayConstructors` 25 assert ES2021 typed-array
[[Set]]/[[GetOwnProperty]] semantics, 2 need other realms, 2 are ordering
defects (`iterated-array-changed-by-tonumber`, fixed in `a79eba0`; proto
access before ToIndex of a Symbol, still open: native constructors receive an
object already created from `new.target`); `TypedArray` 3 `copyWithin` detach files and `Array` 1
`concat_large-typed-array` exceed the 60 s runner limit (arrays keep indexed
elements in the property list, so large arrays are slow); the remaining
cross-realm files need `%Promise.prototype%`/dynamic-constructor intrinsics
of `new.target`'s realm for constructors implemented in the JS prelude.

Annex B residuals: call expressions as assignment targets (7, a later
web-compatibility change), legacy RegExp escapes `\c` in classes and
lone-escape performance (3); `IsHTMLDDA` tests are excluded (host-optional).

Language residuals: `class` elements with `#private` names and numeric
separators are post-ES2020 but untagged; `subclass-builtins` of
`Function`/`GeneratorFunction` construct from runtime strings;
`import.meta/syntax/goal-*` build generator sources through a variable that
holds `%GeneratorFunction%`. Fixed after the Linux run (`1d60f2f`):
`with/…typed-array-in-proto-chain` and 11 `TypedArrayConstructors/internals/Set`
files (a TypedArray prototype of another Receiver: an invalid canonical
numeric key has no effect and a valid one is OrdinarySet on the Receiver, the
receiver rule Test262 checks at the pin) and
`types/reference/put-value-prop-base-primitive` (a Proxy [[Set]] reached from
a primitive base).

Also fixed during the audit (all covered by `tests/language-audit.test.ts`,
`tests/dynamic-functions.test.ts`, `tests/annexb-builtins.test.ts`,
`tests/block-functions.test.ts` and module tests): legacy octal literals,
sloppy future reserved words and `let` disambiguation, destructuring `catch`,
class inner name bindings, `super()` in arrows, derived-constructor return
checks after `try`, `generator.return()` closing for-of/for-await/
destructuring iterators, reference evaluation order in `with`, compound
assignment and `super[k]`, Annex B.3.2–B.3.6 block functions, Annex B
built-ins (`escape`, `unescape`, `substr`, HTML methods, `setYear`,
`toGMTString`), HTML-like comments, ahead-of-time `Function`/
`GeneratorFunction`/`AsyncFunction` for literal sources, module link/parse
errors of dynamic-only modules rejecting `import()`, empty-source dynamic
constructors, split Array/String iterator prototypes, RegExpExec fallback,
Proxy-aware `Object.freeze/seal/isFrozen/isSealed`, receiver-aware set
through proxies, merge-sort `Array.prototype.sort`, unmapped `arguments` for
non-simple parameters, TypedArray/DataView constructor order and realms, and
codegen dead-slot clearing that previously made 2.5k-line files exhaust
memory. Codegen now caches the runtime and prelude image, so a Test262 file
compiles in ~0.2 s instead of ~6 s.

Known gaps kept open: legacy RegExp syntax (Annex B.1.4: `\c` in classes),
call expressions as assignment targets, IsHTMLDDA (host-optional, excluded),
cross-realm defaults for constructors implemented in the JS prelude, and the
performance of large arrays (indexed elements live in the property list, so
building a 10k-element array is quadratic).

## Progress 2026-09-29 (Linux x64 evidence only; Windows pending CI)

Implemented in this batch. Test262 counts are from the Linux runner at the
pinned revision; "eval" means the documented exception.

- **async functions, `await`, async arrows/methods, async generators,
  `for await`, `yield*` in async generators** (0.16): coroutines on the
  existing generator stacks, driven by the Promise prelude with one job queue.
  Test262: `expressions/await` 22/22, `statements/async-function` 70/74,
  `expressions/async-function` 89/93, `statements/async-generator` 300/301,
  `expressions/async-generator` 618/623, `AsyncGeneratorPrototype` 48/48;
  remaining failures use eval. `for-await-of` rerun pending.
  `tests/async.test.ts` (20, GC stress, compared with Node).
- **`with`** (sloppy scripts): object environment records with
  `Symbol.unscopables`, closures, strict-mode rejection. Test262 125/181 before
  the `eval` stub; nearly all failures used eval. `tests/with.test.ts`.
- **Modules**: import/export (named, default, namespace, `export * [as ns]`),
  live bindings, cycles, TDZ, namespace exotic objects, `import.meta`,
  `import()` from modules and scripts for statically named targets
  (`nona build x.mjs` or `--module`). `tests/modules.test.ts` (12).
  Test262 module catalogs pending.
- **Proper tail calls** in strict code (bounded stack, 1e6-deep recursion).
  `tests/tail-calls.test.ts`.
- **Realms**: `$262.createRealm` via per-realm runtime copies sharing one heap,
  GC, symbol registry and job queue; GetFunctionRealm for prototype fallback
  and ArraySpeciesCreate. Only compiled in when requested (`realms` option).
- **Agents**: `$262.agent.*` via agent threads compiled into the image; shared
  SharedArrayBuffer backing stores; Atomics.wait/notify use a FIFO waiter
  registry. Verified on Linux with a notify/wait scenario; Atomics catalog
  pending.
- `eval` now exists (metadata; non-strings returned; strings throw EvalError);
  `Function()` without arguments works, with source throws EvalError.
- Test262 runner: Linux x64, modules, realms, agents, fixtures skipped.

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
- ~~Implement and verify the four Annex B Object.prototype methods~~ Done
  2026-09-29: `__defineGetter__`, `__defineSetter__`, `__lookupGetter__` and
  `__lookupSetter__` are bootstrapped in the runtime prelude
  (`src/runtime/object-annexb-source.ts`) from intrinsics captured before
  user code runs. Pinned Test262 **54/54** on Linux x64 (new Linux mode of
  the runner, also added to the `linux-native` CI job) and
  `object-annexb.test.ts` (17 GC-stress cases compared with Node.js: receiver
  coercion, callable check before one ToPropertyKey, accessor merge,
  prototype walk, Proxy trap order and abrupt traps, metadata, native source).
  Full Linux `built-ins/Object`: 3304/3411; 71 failures are post-ES2020
  `groupBy`/`hasOwn`, and the other 36 fail identically on the previous
  commit. Windows evidence comes from the next CI `check` run. Known deviation: the
  four properties are appended after the static Object.prototype properties,
  so `Object.getOwnPropertyNames(Object.prototype)` order differs from V8;
  ECMA-262 does not specify intrinsic creation order.
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
  update the release documentation and only then close the full ES2020 gate. Do not infer
  the entire gate from the currently green built-in subsets.
