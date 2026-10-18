# Completeness and readiness audit for v0.20.0

**Report date: 2026-10-18 UTC. Status: step 3 of 6; report ready for independent review, not a final verdict.**
This is the technical report for [#394](https://github.com/40oleg/nona/issues/394),
covering the Nona JavaScript compiler/runtime. The target milestone is v0.20.0;
it does not promise that all identified gaps will be fixed in that release.

## Executive assessment

Nona is usable for selected, tested standalone JavaScript tools, especially
bounded CLI/file/data transformations. It is not yet a general Node.js service
replacement. The strongest local evidence is **native Windows x64**: minimist,
JSON5, a small Express JSON service, synchronous fflate compression, cross-spawn
and a p-limit promise queue pass their specific workload contracts. fs-extra,
Undici and workerpool compile but fail at runtime; a public DNS import does not
compile. These are nine pinned package samples, not an npm compatibility rate.
See [the commands and exact outcomes](#workload-results-and-bounded-findings).

The compiler's meaningful distinction is direct machine-code generation with
its own runtime and executable writers, without a C toolchain, LLVM, V8 or a
JavaScript interpreter in the resulting application. That does not imply no
runtime overhead: generic calls/coercions, GC and JavaScript-built libraries
remain, and RegExp matching uses its own bytecode VM. Optional runtime selection
reduces included code, but computed names can require explicit linking.

Native output exists for eight targets. API coverage is narrower: networking
and child processes are implemented only for Windows/Linux x64; filesystem
adapters exist for all eight. Audited-SHA CI gives useful bootstrap/corpus
evidence, but the main check failed and the platform run was cancelled.
Linux is supported by separate historical CI evidence, not a local audit run;
ARM64/macOS/BSD need workload-specific validation before deployment. Emission,
bootstrap smoke tests and application compatibility are distinct claims.

The main adoption obstacles are runtime failure localization, missing file
descriptors/watchers/file streams, incomplete Web/network/crypto contracts,
public worker/IPC absence, and uneven target assurance. Custom TLS and native
memory boundaries require further review; this report is not a security audit.
The Lean project proves a small pure model, not the production compiler.
Historical speed/size results are promising for some workloads but cannot
establish current superiority; [#392 owns their refresh](#performance-and-comparability).

The [risk register](#risk-register) and [bounded roadmap](#prioritized-roadmap)
rank follow-up work. Release gates concern truthful claims, reproducible
evidence and review, not implementing every missing API by v0.20.0. Independent
review/reproduction, corrections and re-review are explicitly reserved for
steps 4–6; no approval or security assurance is implied by this draft.

### How to read the evidence

The [machine-readable inventory](completeness-matrix.json) is the detailed
capability ledger. It contains 140 rows across nine domains, 42 module entry
points (36 public, six private), all eight targets, and commit-qualified source,
documentation and test references. Its statuses are deliberately conservative:
58 implemented but unverified, 58 partial, 16 missing, three intentionally
unsupported, five unknown, and **zero implemented and verified across their full row scope**.
These are scoped inventory categories, not a completeness percentage.
Passing samples are recorded in execution fields; they do not verify every
method or target represented by a broad inventory row.

Matrix IDs such as `api.fs.async` identify exact scoped capability rows. The
following evidence IDs make the findings and roadmap traceable without turning
an importable name into a support claim:

| ID  | Evidence and boundary                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | [Inventory](completeness-matrix.json): source/test/doc blobs pinned to `453418c167b9b34cd5ff7c0f748674e79222e1cc`, compared with v0.18.0; source inspection is not execution.                                                                       |
| E2  | [Windows results](evidence/completeness/windows-x64.json), [repeat](evidence/completeness/windows-x64-repeat.json), [fixture contracts](../tests/fixtures/completeness/README.md): bounded package/API execution, Node 26.9.0 oracle.               |
| E3  | [Local Test262 summary](evidence/completeness/test262-local-summary.json), [CI summary](evidence/completeness/test262-ci-summary.json): explicit selection denominators and exclusions.                                                             |
| E4  | [CI observations](evidence/completeness/ci-observations.json): actual job outcomes and log excerpts, including failures/cancellations and bootstrap scope.                                                                                          |
| E5  | [MoveRules](../verification/Nona/MoveRules.lean), [Examples](../verification/Nona/Examples.lean), [Audit](../verification/Nona/Audit.lean), [proof boundary](formal-verification.md): source-reviewed Lean model, not locally rebuilt in this step. |
| E6  | [PERFORMANCE.md](../PERFORMANCE.md), [benchmark protocol](../bench/README.md), [#392](https://github.com/40oleg/nona/issues/392): dated historical measurements; no new benchmark run.                                                              |
| E7  | [Comparison sources](#versioned-comparisons): official release/docs/source URLs, versions and retrieval date; alternatives other than the Node oracle were not run.                                                                                 |
| E8  | [Step 3 validation](#step-3-validation): focused tests, site checks and omissions for this report revision.                                                                                                                                         |

Source links below are convenient checkout links. For the audited bytes use E1's
commit-qualified registry, or `git show 453418c1:<path>`; the report does not
silently adopt later `main` changes. Step 3 starts from `b2a9d7c5` (the committed
step 2 evidence); compiler/runtime inputs remain at the same audited SHA.

## Provenance and ownership (step 1 snapshot)

| Item                        | Observation                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audited/planning commit     | `453418c167b9b34cd5ff7c0f748674e79222e1cc`                                                                                                                |
| Checkout                    | Clean before this step; preselected issue branch `nona/issue-394`                                                                                         |
| Remote `main` at inspection | Same SHA, confirmed with `git ls-remote`; this is a snapshot, not a moving baseline                                                                       |
| Newest local tag            | `v0.18.0`, resolved separately to `ce350fdf7e1632b258862db1618db4d71bde97f1`                                                                              |
| Confirmed published release | [v0.18.0](https://github.com/40oleg/nona/releases/tag/v0.18.0), published `2026-10-18T16:30:34Z`; GitHub REST `releases/latest`, non-draft/non-prerelease |
| Package version at baseline | `0.18.0`; the working source already includes three later merged PRs                                                                                      |
| Live metadata window        | 2026-10-18, approximately 20:12–20:15 UTC; issue/PR/release state can change                                                                              |
| Ownership                   | `blocked`, `documentation`, `complex`, `nona-agent`, `nona-agent:wip` already present for this run                                                        |
| Development/PR check        | Issue closing-PR references empty; timeline had no linked/cross-referenced PR; no PR for `nona/issue-394`                                                 |
| Execution evidence          | Windows x64 host for structural checks only; no target build/run, emulator, remote runtime execution or CI log reproduction                               |

The owner's [status comment](https://github.com/40oleg/nona/issues/394#issuecomment-6254560680)
identifies host `TORS`, PID 30036. Read-only process inspection confirmed that
PID is the running nona-harness launcher for the workspace containing this
worktree. The owner's [six-step plan](https://github.com/40oleg/nona/issues/394#issuecomment-6254592290)
matches this assignment and specifies `complex`, `hard`, `strong` for step 1.
This continues the existing authorized claim; it does not take another agent's
issue or release its label. The preselected harness branch is retained for the
remaining steps rather than creating a second branch/PR. Its spelling differs
from the conventional `issue-394-<slug>` in AGENTS.md; the final PR owner should
resolve that naming detail without splitting this work.

PR search for `394` also returned #361 because its description contains the
test count `394/394`. Reading that description and the issue timeline showed
that it resolves #322, not #394. No merged PR found resolves this audit.

### Release separation

| Work                                                                   | State at inspection                                             | Treatment                                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [#357](https://github.com/40oleg/nona/pull/357), Array.fromAsync       | Merged `9258b68659a5529681586357c5e7d91f185644ea`, 17:47:53 UTC | Audited source, after v0.18.0                                                     |
| [#361](https://github.com/40oleg/nona/pull/361), Iterator helpers      | Merged `0c94704edfb70a67937020ebdae9cf1e409d865d`, 18:45:06 UTC | Audited source, after v0.18.0                                                     |
| [#356](https://github.com/40oleg/nona/pull/356), float16               | Merged audited SHA, 19:43:07 UTC                                | Audited source, after v0.18.0                                                     |
| [#390](https://github.com/40oleg/nona/pull/390), v0.19.0               | Open, head `8a126b881679bc73ac19c68d6989d1edef90c51d`           | Release proposal, not a published release or baseline feature set                 |
| [#393](https://github.com/40oleg/nona/pull/393), `nona:` docs/examples | Open, head `c6500913b70d062f0ae380c9ada7f9fc72ac460d`           | Coordinate with #391; do not apply its proposed namespace claims to this baseline |
| [#369](https://github.com/40oleg/nona/pull/369), CI filtering          | Open                                                            | Not current CI behavior                                                           |
| [#286](https://github.com/40oleg/nona/pull/286), Lean int32 experiment | Open                                                            | Not part of merged formal assurance                                               |

Each matrix row compares its inspected source files with the release tree.
Unchanged files establish source continuity, **not** release-wide behavioral
verification. A changed shared file does not imply that every capability in
that row is new. Newly added files distinguish the three unreleased additions;
the full transitive dependency history is not reconstructed per method.

### Environment and commands

Host: Windows 11 x64 (`NT 10.0.26200.0`), `TORS`; PowerShell 7.6.5;
Node v22.23.2; npm 10.9.8; Git 2.43.0.windows.1; GitHub CLI 2.101.0.
The repository requires **Node >=26**, and CI pins 26.9.0. Node 22 was used
only for JSON/structural checks and formatting in this step, not as evidence
that the compiler builds on an unsupported development version. There were
no worktree `node_modules` or `dist` directories initially. Prettier 3.9.10 was
invoked through npm exec without installing the compiler's development tree.

Representative provenance commands (read-only):

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse 'v0.18.0^{commit}'
git log --oneline v0.18.0..HEAD
git diff --name-only v0.18.0..HEAD
git ls-remote origin refs/heads/main refs/heads/nona/issue-394
gh issue view 394 --repo 40oleg/nona --json state,labels,comments,closedByPullRequestsReferences,milestone
gh api repos/40oleg/nona/issues/394/timeline --paginate
gh pr list --repo 40oleg/nona --state all --head nona/issue-394 --json number,state,url
gh pr list --repo 40oleg/nona --state all --search '"#394" in:body' --json number,state,body,url
gh issue view 392 --repo 40oleg/nona --json body,state,labels,comments,closedByPullRequestsReferences
gh api repos/40oleg/nona/issues/392/timeline --paginate
gh issue list --repo 40oleg/nona --state open --limit 100 --json number,title,labels
gh pr list --repo 40oleg/nona --state open --limit 100 --json number,title,headRefName,url
gh release list --repo 40oleg/nona --limit 5
gh api repos/40oleg/nona/releases/latest
node --version
npm --version
```

The installed gh uses `closedByPullRequestsReferences`; the older field name
`closedByPullRequests` was rejected and the query was repeated correctly.
`gh pr view <number> --json state,mergedAt,mergeCommit` supplied merge evidence.
No GitHub writes, pushes or PR creation are part of this step.

## Method and evidence limits (step 1)

1. Read AGENTS.md and inspect live claim/development/release metadata before
   implementation. No CLAUDE.md or deeper AGENTS.md was found in this checkout.
2. Compare English/Russian README claims and Unreleased changelog entries with
   current docs and site compatibility/language/module pages. Treat historical
   status tables as dated evidence rather than the current truth.
3. Trace `src/compiler.ts` through lex/parse/eval lowering/binding/IR and native
   generation/linking. Inspect `src/cli.ts`, `src/target.ts`, `src/link.ts`,
   `src/frontend/`, `src/ir/`, `src/backend/`, `src/runtime/`, and `src/lib/`.
   Trace host providers from registration through target selection to method
   bodies, not merely exported names. Generated `sources.generated.ts` is a
   build product; authored JS is the evidence source.
4. Inventory representative method groups/options separately wherever their
   status or target boundary differs. Record both the namespace registration
   and the service implementation; mark private intrinsics/modules explicitly.
5. Attach existing test/probe candidates and their **not-run** status for
   capability reproduction (suite-registration checks are recorded separately). This is
   source inspection and test selection, not a complete line-by-line review of
   every assertion, security analysis, or reproduction of historical CI runs.
6. For negative API findings, inspect registry/global installation paths and
   search source, then check docs. An absent public contract is distinct from
   an internal helper, throwing stub, or deliberate AOT constraint. Record
   bounded uncertainty and a next evidence action.

Example searches, excluding generated tables where relevant:

```powershell
rg --files -g AGENTS.md -g CLAUDE.md
rg -n 'sources|builtinInventory|nona:internal|target !==' src/frontend/builtin-modules.ts
rg -n 'ERR_NONA_UNSUPPORTED|unsupported|export' src/lib/modules/worker-threads.js src/lib/modules/http2.js src/frontend/child-process-module.ts
rg -n 'fetch|WebSocket|WebAssembly|MessageChannel|BroadcastChannel|diagnostics_channel|node:dns|node:dgram' src --glob '!*.generated.ts' --glob '!*-data.ts'
rg -n 'full-ci|gc-stress|TEST262|if:' .github/workflows
```

No all-suite run, Test262 download, bootstrap build, package installation/probe,
performance benchmark, alternative-runtime experiment or security assurance
claim is included. This follows the step boundary and shared-machine limits.

## Inventory map and source findings

| Domain               | Rows | Scope and principal evidence                                                                                                      |
| -------------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------- |
| Language             |   16 | Lexer/parser/binder/lowering; classes/async/generators/modules/eval; RegExp; binary/shared memory                                 |
| Compiler             |    8 | IR passes, liveness/location assignment, calls/caches, machine model/ABI, lexical runtime selection, cache and executable writers |
| Runtime              |   15 | Numeric/string/object/collection/JSON/Date globals, later built-ins, GC/allocation, Promise jobs and scheduler                    |
| Host APIs            |   66 | Method/option groups, globals, explicit aliases, stubs and absent public services                                                 |
| Packaging            |    7 | CLI/distribution/cross compilation, npm/CJS resolution, reproducibility and bootstrap                                             |
| Platforms            |    8 | One distinct artifact/execution row per advertised target                                                                         |
| Developer experience |    8 | Compiler interfaces, plugins/embedding, diagnostics/stacks/debugging, profiling, editor integration and docs/playground           |
| Assurance            |    6 | Test262, differential/corpus/stress checks, Lean model, actual CI gates, security/supply-chain unknowns                           |
| Ecosystem            |    6 | Pinned CLI/files/data/HTTP/streams/subprocess/concurrency samples; comparison scope below                                         |

The JSON retains scope, limitations, affected targets, release relation, evidence
and next evidence needs for every row. Selected material boundaries follow;
these are source boundaries. E2 separately reproduces a subset; it does not verify every method listed.

| Capability IDs                                               | Inspected boundary                                                                                                                            | Evidence / next check                                                                                                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.workers`, `api.messaging`                               | Worker throws `ERR_NONA_UNSUPPORTED`; metadata is fixed; channel exports reference globals without implementations found                      | [worker provider](../src/lib/modules/worker-threads.js). Compile import and invoke separately; do not substitute `$262.agent` for workers                                             |
| `api.http2`                                                  | Constants exist; connection/server/settings functions and request/response constructors throw                                                 | [HTTP/2 provider](../src/lib/modules/http2.js). Exercise a real call after a successful import                                                                                        |
| `api.child-process.*`                                        | Six non-x64-Windows/Linux targets select throwing adapters; even working targets reject fork/IPC                                              | [target dispatch](../src/frontend/child-process-module.ts), [common layer](../src/lib/modules/child-process-common.js), [#328](https://github.com/40oleg/nona/issues/328)             |
| `api.net.*`, `api.http.*`, `api.tls.*`, `api.https.client`   | TCP/HTTP/TLS/HTTPS services only win32-x64/linux-x64; target registry filtering and explicit provider fallback differ                         | [registry](../src/frontend/builtin-modules.ts), [net dispatch](../src/frontend/net-module.ts). Record compile and runtime failures separately                                         |
| `api.tls-https.server`, `api.tls.certificates`               | TLS/HTTPS servers throw; TLS client is TLS1.3-only with restricted verification/services and unaudited crypto                                 | [TLS](../src/lib/modules/tls.js), [HTTPS](../src/lib/modules/https.js), [X509](../src/lib/modules/x509.js). Test certificate failures; do not describe this as security certification |
| `api.http.server`                                            | `headersTimeout`/`requestTimeout` are not enforced per contract                                                                               | [HTTP](../src/lib/modules/http.js), [network docs](network.md). Bounded slow/incomplete-message probes needed                                                                         |
| `api.fs.async`, `api.fs.watch-fd-stream`                     | Promises exist but wrap synchronous operations; watcher/fd/FileHandle/fs-stream services absent from providers                                | [filesystem common code](../src/lib/modules/fs-common.js), [promise exports](../src/lib/modules/fs-promises.js). Check event-loop blocking and realistic file workflows               |
| `api.os.telemetry`, `api.tty`, `api.performance-diagnostics` | CPU/network lists empty, parallelism fixed to one, terminal raw mode only sets a field, performance observer/histogram facades do not measure | [OS](../src/lib/modules/os.js), [TTY](../src/lib/modules/tty.js), [perf hooks](../src/lib/modules/perf-hooks.js). Test behavior, not `typeof`                                         |
| `api.timers.promises`, `api.text-codecs`                     | Several cancellation/ref/streaming codec options are unimplemented; TextDecoder UTF-8-only                                                    | [promise timers](../src/lib/modules/timers-promises.js), [encoding](../src/lib/runtime/encoding.js). Check cancellation after registration and split UTF-8 sequences                  |
| `api.crypto.keys-subtle`                                     | Public crypto lacks ciphers/key/signature/subtle APIs; internal TLS primitives are private                                                    | [crypto](../src/lib/modules/crypto.js). Probe missing exports and user workload impact                                                                                                |
| `dx.stacks`, `dx.source-maps-debugger`                       | Stack capture uses anonymous placeholder call sites; source maps and source debugger interface not found                                      | [error stack prelude](../src/lib/runtime/error-stack.js), [module facade](../src/lib/modules/module.js). Distinguish compile spans from runtime stack locations                       |
| `compiler.link`, `runtime.iterator-helpers`                  | Lexical trigger selection can omit helpers reached through computed/common names                                                              | [link triggers](../src/link.ts). Compare default linking with `--link iteratorHelpers`/`--full-runtime`                                                                               |
| `assurance.formal`                                           | Lean proves a pure straight-line model; production TS refinement, GC, CFGs and generated machine code excluded                                | [formal verification boundary](formal-verification.md), [model](../verification/Nona/MoveRules.lean). No whole-compiler proof claim                                                   |

### Public contracts and namespaces

`entryPoints` enumerates the actual baseline registration, not desired Node
parity. All registered `node:` modules have bare aliases through
`builtinInventory`. The `nona:` aliases in this baseline are **not universal**:
they exist for buffer, fs, fs/promises, events, async_hooks, process, stream,
stream/promises, stream/consumers, string_decoder, zlib, net, child_process,
http, tls and https; `nona:ffi` and `nona:win32` are separate public providers.
For example, this baseline does not register `nona:path` or `nona:crypto`.
Read #393 before making later namespace documentation changes.

The six `nona:internal/` providers are implementation bridges, excluded from
the public builtin inventory. They are not a supported plugin API. Likewise
compiler Test262 agent/realm options and `__nonaRegexpVm` intrinsics are not
general worker or embedding interfaces. `compile`, `CompileOptions`,
`CompileResult`, `ModuleHost` and target helpers are source-exported compiler
interfaces; `package.json` has no stable published library `exports` contract.

Global coverage is spread across runtime constructors, preludes and module
installation. In particular global `crypto` is lazily installed through
`module-records.js` when the compiler requests `node:crypto`; its `webcrypto`
object supplies randomness, not `subtle`. The global constructor list alone
is therefore not a complete global API inventory.

### Platforms: emission is not execution

Step 1 left every target unexecuted. Step 2 adds a **native win32-x64 sample**;
the other seven targets still have local build/execution **not run**. CI entries
in this table describe configured coverage; inspected outcomes are recorded in
the step 2 evidence section. The [platform document](native-platforms.md) cites
a historical eight-target success at `5391c47`; that is not the audited run.

| Target       | Format   | Configured execution                             | Material boundaries                                                                                                       |
| ------------ | -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| win32-x64    | PE32+    | Windows native regression/probes                 | Network/child adapters; GUI resources; OS DLL imports                                                                     |
| linux-x64    | ELF64    | Linux native/oracle plus distribution containers | Network/child adapters; direct kernel calls by default; containers share host kernel                                      |
| linux-arm64  | ELF64    | Native Ubuntu ARM                                | Network/child services absent; 64 KiB layout designed, separate 64 KiB kernel execution unknown                           |
| win32-arm64  | PE32+    | Native Windows ARM                               | Network/child services absent; runtime/native stack bridges; no hardware unwind or OS stack walk through generated frames |
| darwin-x64   | Mach-O64 | Native Intel macOS                               | Network/child services absent; libSystem imports switch relevant images to dyld startup                                   |
| darwin-arm64 | Mach-O64 | Native Apple Silicon macOS                       | Network/child services absent; dyld/libSystem and ad-hoc signature                                                        |
| freebsd-x64  | ELF64    | BSD VM guest probes                              | Network/child services absent; syscall FFI only; no full Node oracle suite in guest                                       |
| openbsd-x64  | ELF64    | BSD VM guest probes                              | Same service gaps; executable path resolution limitations                                                                 |

Filesystem and process adapters exist for all eight. Browser playground output
is cross-compilation, not execution. No local emulation was used. macOS's
authorized OS libSystem dependency and explicit user FFI shared-library imports
must be separated from the default dependency-free Linux executable claim.
FFI can intentionally introduce an ELF interpreter/library dependency.

## Compiler, runtime and deployment

### Language contract and compilation pipeline

The stated contract is ES2020 with AOT exceptions and individually implemented
later additions, not complete ES2021–ES2026 editions. E1's `language.*` and
`runtime.*` rows cover precedence/coercion, scope/early errors, closures,
destructuring, objects/descriptors, classes/private elements, async/generators,
ESM/live bindings/cycles/top-level await, exceptions, BigInt, binary/shared
memory and Atomics. Annex B remains partial. RegExp `d`/`v`, Unicode properties,
lookbehind and later helpers are implemented; the old negative `v` claim is
contradictory. Float16, Iterator helpers and Array.fromAsync are post-v0.18.0
source at this baseline. The retained Test262 evidence does not certify every
semantic combination in any of these families.

The actual path in [compiler.ts](../src/compiler.ts) is:

```text
source + compile-time module graph
  -> lex (tokens and runtime-part usage), parse (AST)
  -> recoverable eval/Function source lowering, bind (scope/early errors)
  -> lower (slot-based functions, basic blocks, explicit operations/terminators)
  -> IR cleanup and facts, direct-call annotation, liveness/slot locations
  -> program + native runtime + selected JS preludes -> machine fragments/fixups
  -> target startup/OS shims/imports -> PE, ELF or Mach-O bytes
```

[Module loading](../src/frontend/modules.ts) and the
[CommonJS host](../src/frontend/commonjs.ts) transform dependencies before
binding. The runtime receives a compiled graph. Literal/recoverable `eval` and
Function constructors can be compiled with guards; arbitrary source created at
runtime raises `EvalError`. Computed import/require can select known compiled
entries, not discover and execute newly deployed source. Those limits are
intentional AOT policy ([#11](https://github.com/40oleg/nona/issues/11)); failures
within the supported static subset are still bugs. The compiler accepts JS,
not TypeScript/JSX merely because its implementation is TypeScript.

### Optimizations that exist, and their fallback cost

| Stage                  | Actual implementation                                                                                                                                                                                                      | Limit / consequence                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IR cleanup             | [optimize.ts](../src/ir/optimize.ts) removes redundant initialization checks, folds constants, simplifies CFGs, forwards copies, folds nullish facts, marks proven numeric operations, forwards again and coalesces moves. | Facts must respect effects, capture mutation and TDZ; general coercion remains a runtime call. This is slot IR, not a whole-program SSA/JIT pipeline.                              |
| Dead moves and storage | [copies.ts](../src/ir/copies.ts), [liveness.ts](../src/ir/liveness.ts), [locations.ts](../src/ir/locations.ts) use CFG liveness and interference-based slot sharing.                                                       | Stack-slot reuse is not general register allocation. Parameters, handler destinations and live floors constrain sharing; mapped arguments disable unsafe copy propagation.         |
| Calls                  | [calls.ts](../src/ir/calls.ts) annotates known ordinary function declarations; generated fast paths check the actual callee. Runtime prologue/method/new caches reduce repeated dispatch.                                  | Captured, reassigned, bound/proxy/async/generator and boxing paths still need general invocation. Guarded inlining and scalar replacement remain open work (#235/#236/#239).       |
| Data access            | [object model](object-model.md), runtime properties/arrays and [SIMD](simd.md) implement shapes, inline slots, property caches/indexes, dense elements and selected SSE2/NEON/string/typed-array kernels.                  | Accessors/prototypes/proxies, sparse storage and invalidated caches retain general paths. This is not universal unboxing, escape analysis or loop bounds-check elimination (#240). |
| Strings and libraries  | Ropes defer concatenation copying; flattening restores flat UTF-16 before operations needing it. Most large libraries are compiled JS.                                                                                     | Flattening, callbacks, allocation and RegExp VM dispatch can dominate. Source complexity suggests profiling targets, not a measured bottleneck ranking.                            |

These statements come from production passes, not roadmap aspirations. The
shared [machine context](../src/backend/machine/context.ts) selects an x64 or
ARM64 assembler. ARM64 re-encodes a logical x64-shaped operation/register model;
it is not x86 emulation in the emitted program. Raw x64 byte emission must be
guarded. Transcendentals use x87 steps on x64 and software routines on ARM64,
so numerical/ABI validation must cover both paths.

### Runtime linking, values, roots and exceptions

[link.ts](../src/link.ts) selects optional preludes/tables using identifiers,
property names and string literals seen by the lexer, plus required syntax
helpers from lowered IR and dependency closure. `--print-link` explains
selection; `--link <part>` and `--full-runtime` explicitly include parts.
This is not semantic export-level tree shaking. For example `map` alone does
not request Iterator helpers; a name built at runtime may miss a trigger.
Selected JS preludes are lowered through the same compiler, use exactly two
top-level bindings, and communicate through `__nonaRegexpVm`. That shared
intrinsic object and the two-binding invariant are maintenance boundaries,
not a public extension API. [Base-image caching](../src/backend/x64/base-image.ts)
and [disk caching](../src/cache.ts) amortize runtime compilation; a warm-cache
build time must not be reported as a cold compiler time.

[Values](../src/runtime/value.ts) are 16-byte tag/payload pairs; Number payloads
hold binary64. Objects, strings, symbols, BigInts and internal references have
different tracing/representation paths. Objects combine shared shapes and
inline slots with general property/index/element storage. Strings use UTF-16,
including lone surrogates, with explicit UTF-8 boundaries. These representations
are implementation detail, not a safe C ABI for embedders.

The [collector](../src/runtime/gc.ts) is precise, nonmoving mark/sweep with an
iterative grey work list, weak ephemeron processing and lazy size-class sweep.
Large mappings, backing storage, coroutine stacks and allocator retention mean
live JS values, retained heap and process peak RSS are different quantities.
Compiled functions expose live slots at safepoints; native helpers use
[rootedFn](../src/runtime/root-scope.ts) to retain inputs, containers and locals
across allocating calls. Range roots require stable contents during callbacks.
Stress mode collects at allocations and poisons freed cells; it can detect
missing roots but cannot prove their absence. E2's 100-allocation closure
sample is deliberately much narrower than the collector's whole state space.

Internal calls follow a Win64-shaped convention: shadow space, aligned calls,
preserved registers and explicit argument/value locations. OS/FFI thunks
translate to SysV AMD64, AAPCS64/Apple ARM64 or Windows native conventions.
[JS exception transfer](../src/runtime/exceptions.ts) restores handler state,
GC roots, cleanup records, stack and saved registers before jumping to a
landing target; normal ABI epilogues are bypassed. Generator/async saved
stacks interact with rooting and stack budgets. Catchable JS errors are not
proof of OS unwinding: win32-arm64 does not supply hardware unwind/OS stack
walking through its generated frames. PE unwind metadata on other paths is
also not a source debugger.

### Module resolution, packaging and bootstrap

`nona build <file-or-package> -o <output> --target <target>` is the deployment
entry point. `--module`, `--conditions`, runtime-link options, coverage/call
statistics and x64 assembly output serve different purposes. Windows GUI
subsystem/icon/manifest/version resources are win32-x64-only. The
[resolver](../src/frontend/node-resolution.ts) handles `node_modules`, package
`exports`/`imports`/`main`/`type` and entry `bin`, conditions (`nona`, `node`,
import/require/default plus user conditions), symlinks and JSON/CJS conversion.
Extension search is not identical to Node ESM. npm installation, lifecycle
scripts and upstream transpilation occur outside Nona. `package.json` is
private, with a CLI `bin` and no stable published library `exports` contract.

Native applications contain their program and Nona runtime. Default Linux/BSD
paths use kernel services without libc; Windows uses OS DLLs as required by
selected services, not universally KERNEL32 alone. macOS can use system
dyld/libSystem for startup/OS services. Explicit library FFI introduces import
dependencies: Linux emits `PT_INTERP`/`DT_NEEDED` and requires its selected
loader/libraries; Darwin uses dyld imports; Windows uses PE imports. BSD FFI
is syscall-only. ARM64 Mach-O ad-hoc signing is not distribution notarization.
Archive extraction permissions, OS minimums and downstream signing still need
deployment testing; cross-compilation alone establishes none of those.

[Bootstrap](self-hosting.md) builds the TS compiler to JS using Node, then
compiles a native stage 1 and uses it for stage 2. The audited x64 Windows/Linux
CI compares stage-1/2 image bytes with Node absent from PATH. Other target jobs
use smoke mode. This is a useful fixed-point check, not a proof of compiler
correctness, diverse double compilation, or reproducible release archives on
independent machines. [Release packaging](../scripts/release-archives.mjs)
checks versions/target artifacts and publishes SHA256SUMS; archive timestamps,
tool versions and provenance require separate reproducibility work.

### Debugging and development experience

`compile()` returns image/imports or structured diagnostics with file/span/code;
phase wrappers distinguish compiler-internal errors. `ModuleHost` supplies
resolve/read hooks, not an optimizer plugin or embedded runtime API. CLI source
positions help compile errors, but E2's runtime package failures are generic.
[Error.captureStackTrace](../src/lib/runtime/error-stack.js) synthesizes
anonymous CallSites; it does not walk JavaScript frames. No production
source-map, DWARF/PDB or inspector interface was found (`dx.*`, E1).

`--coverage` emits V8-shaped per-function coverage, `--call-stats` counts call
targets, and `--print-asm` lists x64 program assembly; none is a sampling CPU
profile or working heap inspector. `perf_hooks` observers and event-loop
histograms contain no-op/zero facades. The site/playground helps exploration
and downloads foreign artifacts without executing them. No supported Nona
LSP, app TypeScript checker or general configuration/plugin contract was found.
Migration therefore needs pinned dependency probes, explicit target/API choices,
pre-transpilation where necessary, and special attention to `process.argv`
(executable followed directly by user arguments), static module selection and
Date/Intl restrictions.

## Documentation discrepancies and disposition

These source-backed observations are recorded without rewriting unrelated
pages or claiming that a documentation correction verifies runtime behavior.
References resolve to the audited versions through the matrix registry.

| Document claim                                                                                                                                                 | Counterevidence / interpretation                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| README limitations still list RegExp `v` as unsupported, while the support section includes it                                                                 | RegExp VM and `regexp-v-flag.test.ts` exist; the contradictory negative is removed from both READMEs; full v-mode verification remains scoped in E1 |
| README/README.ru publish v0.8.0 Test262 counts; `docs/status.md` has a different full-run table at `60b5763`; `language-support.md` warns of a v0.5.0 snapshot | Do not combine denominators or present any as audited-SHA conformance                                                                               |
| `docs/host-apis.md` says optional fs requires Windows/Linux; `docs/process.md` says fs unavailable on Darwin/BSD                                               | `fs-module.ts` dispatches all eight targets; current fs/native-platform docs agree                                                                  |
| Early `docs/fs.md` says `fs.promises` absent; later section says present                                                                                       | `fs-common.js` builds the object and `fs-promises.js` re-exports it                                                                                 |
| `docs/npm.md` says only Intl.Segmenter exists                                                                                                                  | `intl-source.ts` combines formatting/collation/plural services and grapheme segmentation; en/en-US and UTC limits remain                            |
| Buffer/network docs say require unavailable; networking text says no global URL                                                                                | CJS graph transformation, builtin registration and URL prelude now exist; runtime compatibility still needs probes                                  |
| Host API long-running section describes linear storage and a mapping per heap block                                                                            | Shapes/indexing and POSIX size-class arenas supersede parts of that description; consult current object model and shims                             |
| Platform docs imply platform workflow coverage on every PR; corpus docs imply all stress executions on every PR                                                | Actual workflow predicates require `full-ci` for platforms and gate stress/path-selected Test262 jobs; AGENTS.md describes these newer rules        |
| `node:module.builtinModules` is read as actual target support                                                                                                  | Its static list omits crypto/async_hooks and includes services unavailable on some targets; compiler registry and method behavior are authoritative |

## Performance and comparability

[#392](https://github.com/40oleg/nona/issues/392) was rechecked in step 3 on
2026-10-18: open and `blocked`, no completed results or linked performance PR
in the inspected timeline. Its owner retains the benchmark task. No benchmark,
performance issue claim or competing measurement was made here. Follow its
results when published; do not substitute probe durations or artifact sizes.

[PERFORMANCE.md](../PERFORMANCE.md) labels its top section v0.13.0 but explicitly
reuses the 2026-10-14 post-v0.12.0 `b58f0bc` run: shared Linux x64 cloud VM,
Xeon 2.10 GHz, two vCPUs, Node 22.22.0, Deno 2.9.6, Bun 1.4.3. It is neither
v0.18.0 nor audited-SHA evidence. It reports strong startup/size results for a
small program and slower calls, promises, allocation and RegExp-heavy programs;
those are historical workload results, not universal architectural rankings.
Its own noise warning is about 1.5x on that shared VM.

| Dimension  | What E6 actually permits                                                                                               | What remains unknown for this baseline                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup    | Historical hello-world process wall time, 30 runs after five warm-ups.                                                 | Cold filesystem/startup conditions, meaningful application graphs and current runtime versions.                                                    |
| Throughput | Short microbenchmarks (three runs) and acorn/marked samples with output checks.                                        | Warm-up curves, stable steady state, equivalent APIs and representative persistent services. Whole-script timing includes startup.                 |
| Build cost | Nona's runtime cache was warm; a separate cold-build estimate is mentioned.                                            | Repeated cold/warm distribution, peak compiler memory and packaging costs on matching hosts.                                                       |
| Size       | Native Nona artifact versus Bun runtime-containing executable. Deno compile download failed; Node SEA was not rebuilt. | Current SEA/deno compile sizes; old v0.7.0 values must not be combined into a current table. Runtime size and application-only size are different. |
| Memory     | `/usr/bin/time` peak RSS for the measured programs.                                                                    | Retained/live heap, native backing storage, long-lived growth, and same-workload current peak RSS.                                                 |

Nona has no JIT tier-up; that does not make execution times constant (caches,
allocation, OS scheduling and input still matter). No speed, memory or size
number from another project's promotional benchmark is transplanted here.
The decision for a latency-sensitive CLI differs from a throughput-heavy
server. #392 should establish equivalent outputs, hardware/OS, warm-up and
spread before re-ranking #44/#47/#48/#155/#235/#236/#239/#240 and #387–#389.

## Step 2 practical evidence

### Baseline, setup and reproduction

The local experiments use **Windows 11 x64, NT 10.0.26200**, on TORS, Intel
Core i7-13620H, with Node **26.9.0** (V8 and OpenSSL versions are in the JSON),
npm **10.9.8**, TypeScript **7.0.2**, Prettier **3.9.10**, PowerShell **7.6.5**
and Git **2.43.0.windows.1**. Node was downloaded from
[the official 26.9.0 distribution](https://nodejs.org/dist/v26.9.0/);
`win-x64/node.exe` SHA-256
`8490398f5e0082772dfb0ae5a6ebdff98a97696a20cb9778b4f82eec79b6d0a1`
matches its published SHASUMS256.txt. No global Node installation was changed.

Compiler inputs remain at **453418c167b9b34cd5ff7c0f748674e79222e1cc**;
the step 1 checkout commit is **23289bc41a71f0766a9f96d3bbfc6873bf89c64b**.
The new fixture/runner revision is identified by content hashes in each result;
the full fixture digest is
`d7ec25bc34227da91cd895cec9eb12f2d3ff54294ca10826e8ace7d61a503c13`.
The latest published release was rechecked as **v0.18.0**. These experiments
exercise the audited source after that release, not the release executable.
The runner refuses a baseline whose compiler inputs differ from the checkout.
It requires a fresh explicit build; it does not authenticate an arbitrary stale
`dist/` directory. This run rebuilt it from the unchanged compiler inputs.

The [fixture guide](../tests/fixtures/completeness/README.md) documents package
selection, primary sources, pins, commands, timeouts, cleanup and output
contracts. The [full result](evidence/completeness/windows-x64.json) preserves
setup, Node oracle, compilation, artifact and execution records separately.
The [repeat sample](evidence/completeness/windows-x64-repeat.json) reproduced
the same outcomes for eight cases with a reused installation. Actual commands include temporary paths and
loopback ports; rerun the top-level invocation to create fresh equivalents.
Paths in these files describe this execution, not files expected to survive.

Commands used from this checkout (the explicit npm CLI avoids accidentally
using the machine's Node 22 through its npm launcher):

```powershell
$probeNode = (Resolve-Path work/completeness-tools/node.exe).Path
$npmCli = 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js'
& $probeNode $npmCli ci --ignore-scripts --no-audit --no-fund
$env:GOMAXPROCS = '2'
& $probeNode scripts/build.mjs
& $probeNode scripts/completeness-probes.mjs --install --npm-cli $npmCli --audited-commit 453418c167b9b34cd5ff7c0f748674e79222e1cc --output docs/evidence/completeness/windows-x64.json
& $probeNode scripts/completeness-probes.mjs --cases cli,filesystem,http-client,workers,stream-writable-queues,gc-roots,dns-api,tls-verification --audited-commit 453418c167b9b34cd5ff7c0f748674e79222e1cc --output docs/evidence/completeness/windows-x64-repeat.json
```

On another machine use an installed Node >=26 and its npm CLI. Run root
`npm ci` and `node scripts/build.mjs` first. The root build and fixture `npm ci`
succeeded. An initial npm invocation used the machine's Node 22 and emitted
an engine warning; setup was repeated explicitly under Node 26 before the
retained runs. An initial fixture lock generation from the wrong working
directory added an unwanted local dependency; it was removed and the isolated
lock regenerated before these results. Neither is counted as a Nona failure.

### Workload results and bounded findings

All **16 Node oracles pass** their explicit expected-output contracts. Nona
creates **15 artifacts**; the DNS case fails compilation and is not executed.
Native results: **11 agreements, three runtime failures, one verified API-gap
response**. No retained run times out. All executables, subprocess trees and
loopback services are cleaned up. Timings and binary sizes in the raw record
are provenance and timeout diagnostics, not performance comparisons with #392.

| Workload / pinned package                      | Compilation / artifact | Native execution compared with Node                                                                                                                                   |
| ---------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI + `node:fs`, minimist 1.2.8                | Pass / created         | Agreement: argument alias/negation, JSON write/read/delete.                                                                                                           |
| Recursive async filesystem, fs-extra 11.3.0    | Pass / created         | Exit 1, empty stdout, stderr `Nona runtime error\r\n`; Node prints `filesystem 5`.                                                                                    |
| JSON5 config, json5 2.2.3                      | Pass / created         | Agreement: parse, stringify, aggregate and reject invalid input.                                                                                                      |
| JSON POST server, Express 5.1.0                | Pass / created         | Agreement: JSON middleware, route, response status 201 and sum 5.                                                                                                     |
| HTTP JSON client, Undici 7.16.0                | Pass / created         | Exit 1, `TypeError: Invalid operation`; Node prints `client 200 42`.                                                                                                  |
| Chunked gzip, fflate 0.8.2                     | Pass / created         | Agreement: two input chunks and decompressed `hello stream`; async workers untested.                                                                                  |
| Child execution, cross-spawn 7.0.6             | Pass / created         | Agreement: capture `child-ok` and exit 7. Explicit Node payload dependency; not a Node-free deployment claim.                                                         |
| Promise task queue, p-limit 6.2.0              | Pass / created         | Agreement: four ordered results, at most two active, queue empty.                                                                                                     |
| Worker task, workerpool 9.3.4                  | Pass / created         | Exit 1, `ReferenceError: Invalid operation`; Node prints `workers 5`.                                                                                                 |
| Existing `stream-writable-queues` case         | Pass / created         | Agreement: second write returns false at highWaterMark, queued length/needDrain, batched writev, callbacks and closed state.                                          |
| Existing `stream-web-cancellation` case        | Pass / created         | Agreement: abort propagation despite stopImmediatePropagation, destroyed source, released locks and invalid-signal error.                                             |
| Closure/object retention with `gcStress: true` | Pass / created         | Agreement after 100 captured object allocations; narrow rooting sample, not memory-safety proof.                                                                      |
| `node:worker_threads.Worker`                   | Pass / created         | Explicit `ERR_NONA_UNSUPPORTED`; Node receives a worker result of 42. API absence is reproduced, not a compatibility pass.                                            |
| `node:zlib` sync gzip/gunzip                   | Pass / created         | Agreement on a gzip round trip; other codecs/options remain scoped separately.                                                                                        |
| `node:dns.lookup('localhost')`                 | **Fail / none**        | `E_MODULE: Cannot resolve module 'node:dns'`; execution not run. Node resolves a loopback address.                                                                    |
| `node:tls` verification                        | Pass / created         | Agreement: trusted CA succeeds with `authorized=true`; wrong hostname yields `ERR_TLS_CERT_ALTNAME_INVALID`; untrusted leaf yields `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. |

The three package errors are exact observed diagnostics, **not established root
causes**. They lack an actionable source stack. In particular, the workerpool
failure cannot be attributed solely to the Worker stub from its diagnostic;
the separate Worker probe supplies the direct API evidence. Follow-up scopes
for step 3: isolate the first failing fs-extra/Undici/workerpool operation,
identify its transitive dependency and improve runtime error localization.
Do not silently patch packages or implement missing runtime features in #394.

For the tested simple workloads, direct `node:fs` works where fs-extra failed,
the HTTP primitives used inside the passing Express case provide a narrower
alternative to Undici, and p-limit handles promise concurrency. None supplies
fs-extra's full API, Undici's pooling/streaming contract or parallel worker
execution. DNS users need a resolver integration; literal loopback addresses
are sufficient only for these probes. TLS verification is a three-case positive/
negative sample with a fixture CA, not an assurance of secure networking under
adversarial traffic. No external network is used during workload execution.

### Test262 denominators and runner limitations

The runner and CI pin **7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd**. Its
tracked `test/**/*.js` tree contains **53,597 candidate files** after excluding
`_FIXTURE` names, following `filesUnder`'s rules. This is a file denominator,
not the number of strict/sloppy/module execution variants. A sparse checkout
was used to inspect the tree and run eight chosen coalescing cases:

```powershell
git init work/test262
git -C work/test262 remote add origin https://github.com/tc39/test262.git
git -C work/test262 config core.longpaths true
git -C work/test262 fetch --depth 1 --filter=blob:none origin 7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd
git -C work/test262 sparse-checkout set harness test/built-ins/JSON test/language/expressions/coalesce
git -C work/test262 checkout --detach FETCH_HEAD
$env:TEST262_JOBS = '1'
$env:TEST262_RUNTIME_TIMEOUT_MS = '15000'
$env:TEST262_DELETE_BINARIES = '1'
$env:TEST262_FILE_LIST = 'tests/probes/completeness-test262.txt'
$env:TEST262_REPORT = 'work/completeness-test262-local/coalesce.json'
& $probeNode scripts/test262-smoke.mjs language/expressions/coalesce
& $probeNode scripts/completeness-test262-summary.mjs work/test262 work/completeness-test262-local work/test262-local-summary.json
```

Local scope: 24 files in the group; **8 selected/evaluated, 6 executed natively,
2 compile-only negative checks, 8 passed, 0 failed, 0 skipped; 16 excluded by
the explicit sample list**. See the [raw report](evidence/completeness/test262-local.json),
[denominator summary](evidence/completeness/test262-local-summary.json) and
[selection file](../tests/probes/completeness-test262.txt). The other 53,589
tree files were not evaluated locally. This tiny sample is not an ES conformance
rate and does not reproduce all CI exclusions.

Nine available report artifacts were downloaded from audited-commit
[check run 39160044403](https://github.com/40oleg/nona/actions/runs/39160044403).
The [CI summary](evidence/completeness/test262-ci-summary.json) retains source
report SHA-256 hashes, original filters, targets and counts. The small
denominator script validates counts and the Test262 revision; it does not
reinterpret exclusions or execute tests.

| CI group                        | Total in group | Selected / executed / passed | Excluded before selection | Failed / skipped |
| ------------------------------- | -------------: | ---------------------------: | ------------------------: | ---------------: |
| ArrayBuffer                     |            221 |                           82 |                       139 |            0 / 0 |
| DataView                        |            561 |                          476 |                        85 |            0 / 0 |
| Date                            |            594 |                          583 |                        11 |            0 / 0 |
| JSON                            |            165 |                          142 |                        23 |            0 / 0 |
| Object/prototype (Linux subset) |            248 |                           54 |                       194 |            0 / 0 |
| Promise                         |            732 |                          522 |                       210 |            0 / 0 |
| Reflect                         |            153 |                          152 |                         1 |            0 / 0 |
| SharedArrayBuffer               |            104 |                           59 |                        45 |            0 / 0 |
| TypedArray                      |          1,453 |                        1,117 |                       336 |            0 / 0 |
| These nine disjoint scopes      |      **4,231** |                    **3,187** |                 **1,044** |        **0 / 0** |

These are **historical CI runtime executions** at the audited SHA, not new
local executions. The other 49,366 tree files lie outside these nine report
scopes. A zero skip count does not erase the 1,044 pre-selection exclusions.
Reproduce artifact inspection without rerunning the large suites:

```powershell
gh run download 39160044403 --repo 40oleg/nona --pattern 'test262-*-report' --dir work/completeness-ci
& $probeNode scripts/completeness-test262-summary.mjs work/test262 work/completeness-ci work/completeness-test262-ci-summary.json
```

Source inspection found these limits:

- Path/file-list/direct-only/feature filters act **before** `results`; excluded
  files do not appear in `counts.skip`. `TEST262_FILE_LIST` and full-runtime
  mode are not serialized in the final runner report, so the command and
  selection file must accompany it. There is no xfail counter in this runner.
- `CanBlockIsFalse`, raw mode, disabled async and other unsupported negative
  modes become skips. Parse/resolution negatives pass on any compiler failure;
  the runner does not verify the exact expected error class for those cases.
- Default tests run in one variant; `onlyStrict` adds a directive. Passing
  files are not proof of both Test262 default strictness variants.
- Async completion markers are checked, realms are capped at four, agent source
  discovery is bounded, and unhandled rejections are ignored for harness policy.
  These are harness assumptions, not a complete host conformance model.
- The summary script's `eval`/`post`/`other` failure labels are source heuristics,
  not proven root causes. The `post-es2020` list is not a canonical edition
  boundary; for example its actual list still contains WeakRef and
  well-formed-unicode-strings despite broader current implementation claims.
  Keep failures/exclusions visible while reconciling that filter in follow-up.

### Reused platform, corpus and bootstrap evidence

[CI observations](evidence/completeness/ci-observations.json) preserve run/job
URLs, SHAs, outcomes, selected log excerpts and retrieval commands. They are
separate from local execution records:

- The audited `check` run failed Windows shard 1/4 at
  `runtime-link.test.ts`, “programs using each optional prelude behave as
  before”: `rmSync` reported `EPERM` on its temporary directory. This is a
  cleanup failure; it still means the baseline workflow was not green.
- The audited native-platform workflow was **cancelled with no job execution**.
  A successful intervening PR run inspected during the audit ran only the
  browser compiler and skipped native matrices. Workflow badges alone are
  insufficient platform evidence.
- Release v0.18.0 run
  [39142649906](https://github.com/40oleg/nona/actions/runs/39142649906)
  executed native linux-x64/darwin-x64 suites, Linux distribution containers and
  FreeBSD/OpenBSD guest-VM probes successfully. Linux arm64, Darwin arm64 and
  Windows arm64 jobs failed in portable oracle suites; logs include long-running
  RegExp tests. This is historical release evidence, not a reproduced current
  compiler defect or a passing audited-commit platform matrix.
- Audited-SHA [self-hosting run 39160044376](https://github.com/40oleg/nona/actions/runs/39160044376)
  succeeded across all eight target jobs. Windows/Linux x64 logs explicitly
  report deterministic stage 2 with Node absent from PATH; `verify-selfhost.mjs`
  compares stage 1/2 image bytes/hash. Other native targets and BSD guest VMs
  use `--platform-smoke`, which does not perform that stage-2 comparison.
  This is useful execution evidence, not a claim of independently reproducible
  release packaging across arbitrary machines/toolchains.
- Audited-SHA [program corpus run 39160044385](https://github.com/40oleg/nona/actions/runs/39160044385)
  completed successfully on Linux and Windows: **1,011 tests passed, zero failed
  or skipped per job**. These are test counts, not independent npm applications.
  No corpus rerun was performed on this shared machine.
- `scripts/check-weak-memory.mjs` compares weak/strong retention under a 96 MiB
  Linux address-space cap (Windows dispatches via WSL). Its source was inspected;
  no corresponding retained CI result was located in these runs and it was
  **not executed locally**. The GC-root probe does not substitute for it.

No local Linux, arm64, macOS, BSD, emulator, cross-target package execution,
full conformance suite, benchmark or bootstrap was run in step 2. Their local
matrix states remain not-run. API/target-specific tests outside the selected
sample, package upstream test suites, larger payloads, persistent servers and
adversarial networking remain unverified. The conclusions below retain these boundaries.

### Step 2 validation

`scripts/build.mjs` succeeded. The focused inventory, runner and suite-registration
tests pass (**14 tests**); runner tests cover nonzero exit, missing executable,
timeout, descendant termination, output bounds, cleanup, invalid CLI arguments,
dependency pins and denominator accounting. New default tests are registered
once in `tests/suites.json`. Formatting, JSON/inventory validation and local
documentation links are checked before this step's commit. No full suite or
site build was run, as required by the step's resource limits.

```powershell
& $probeNode --test --test-concurrency=2 dist/tests/completeness-probes.test.js dist/tests/completeness-inventory.test.js dist/tests/suites.test.js
& $probeNode scripts/check-completeness-inventory.mjs --git
git diff --check
```

## API gaps in real workloads

E1 is the method/option ledger, including namespace and target selection; the
table below translates it into user decisions. "Alternative" means a bounded
workaround or another runtime, not a tested drop-in substitute. S/M/L/XL are
relative scopes (one narrow change / several connected APIs / cross-layer
subsystem / architectural program), not schedule promises. Uncertainty is
explicit because three package root causes remain undiagnosed.

| Workload / capability IDs                                                                                         | Implemented boundary and blocker                                                                                                                                                                                                                     | Alternative now                                                                                                                                                       | Prerequisite and compatibility acceptance                                                                                                                                        | Priority / size / uncertainty                                      |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| CLI/file conversion: `api.process.*`, `api.fs.*`, `ecosystem.cli-files`                                           | Metadata, stdio and whole-file APIs exist; byte reads return Uint8Array, fs text is UTF-8, access checks existence, most bigint Stats fields stay Numbers. fs-extra fails E2.                                                                        | Direct fs works in minimist probe; keep inputs bounded, adapt argv and explicit encodings.                                                                            | Minimize fs-extra failure first, then preserve Node return/error/flag contracts or document deliberate differences.                                                              | Near-term R1/R3; M; high root-cause uncertainty.                   |
| Watchers, editors, large-file pipelines: `api.fs.watch-fd-stream`                                                 | No public open/FileHandle/fd I/O, fs streams or watchers; promises/callbacks execute synchronous I/O before notification.                                                                                                                            | Whole-file reads only for bounded files; external watcher or Node service changes deployment.                                                                         | Descriptor ownership, partial reads/writes, close-on-error, backpressure/abort, readiness and platform watch normalization.                                                      | Near-term R3; L; high. Split watchers from descriptor/stream work. |
| Path/URL/text: `api.path`, `api.url`, `api.text-codecs`, `api.buffer.*`                                           | Path flavors/matchesGlob and Buffer codecs exist; URL IDNA helpers are placeholders, TextDecoder is UTF-8-only and ignores streaming; encodeInto absent.                                                                                             | `string_decoder` for its supported incremental contract; Buffer conversion for supported labels; avoid IDNA-dependent routing.                                        | Split multibyte/BOM/fatal/surrogate vectors; IDNA normalization/security boundary; target-specific path/error tests.                                                             | Near-term R6; M; medium.                                           |
| Interactive CLI/telemetry: `api.console`, `api.os.*`, `api.tty`, `api.util`                                       | console lacks Node inspection; util subset lacks parseArgs; CPU/network lists empty, parallelism fixed, priority no-op, terminal raw mode only sets a field.                                                                                         | minimist probe; explicit util.inspect/JSON; fixed application configuration; OS-native terminal tool.                                                                 | Implement OS queries/raw-mode restore/resize or expose unsupported status; never present zero/no-op telemetry as real measurement.                                               | Near-term R6; M; medium.                                           |
| Scheduling/context/observability: `api.timers*`, `api.events`, `api.async-context`, `api.performance-diagnostics` | EventEmitter, AbortSignal and ALS paths exist; timeout handles are Numbers; timer ref/abort options incomplete; async hooks omit native lifecycle events; perf observer/histogram facades do not measure; diagnostics_channel absent.                | Explicit application logging and call counters; p-limit for promise queues, not CPU parallelism.                                                                      | Cancellation during wait, exact-once cleanup, exit liveness, native resource IDs/context; real clock/histogram or explicit unsupported result.                                   | Near-term R6; M/L; medium.                                         |
| Streams/compression: `api.stream.*`, `api.zlib.codecs`, `api.compression-gaps`                                    | Node-style queues/helpers and gzip/DEFLATE exist; E2 verifies backpressure/cancellation samples and fflate sync chunks. General Web streams/TransformStream and node:stream/web are incomplete/absent; Brotli throws, ZSTD constants are not codecs. | fflate's tested sync gzip path; bounded buffers; external compressor with supported child process. ZIP/tar need a package and are not implied by gzip.                | Descriptor streams first for large files; flush/truncation/output limits/abort; codec vectors and archive path policy if added.                                                  | Near-term R3/R4 for streams; later codec scopes, M/L; high.        |
| HTTP client/service: `api.http.*`, `api.fetch-websocket`                                                          | Express JSON sample passes on win32-x64. Undici fails; no fetch/Headers/Request/Response/FormData or WebSocket service. HTTP server timeout fields are not enforced.                                                                                 | Supported HTTP request/server primitives on x64; protect deployment with an independently configured proxy. Neither workaround was verified as an Undici replacement. | Reduce Undici error; implement body/redirect/header/abort/stream contracts, then Fetch; timeout/parser hardening before exposed-service claims.                                  | Near-term R1/R4; L; high.                                          |
| DNS/UDP and socket lifecycle: `api.dns-udp`, `api.net.*`                                                          | TCP with internal name resolution exists on two targets; no node:dns/dgram; IPC socket paths rejected. DNS import fails E2.                                                                                                                          | Internal TCP hostname resolution for supported clients; literal addresses for fixed endpoints; external resolver for DNS tools.                                       | Resolver errors/cancellation/timeouts/cache/family ordering; datagram boundaries/multicast and socket close/ref semantics.                                                       | Near-term R4 DNS; UDP separately later; M/L; high.                 |
| Secure clients/servers: `api.tls.*`, `api.https.client`, `api.tls-https.server`, `api.http2`                      | TLS1.3 client only; no client certs or resumption, TLS/HTTPS servers throw, HTTP2 services throw. HTTPS ciphers/minVersion accepted without effect.                                                                                                  | Reverse proxy for inbound TLS/HTTP2, external mature client for required protocols; these are proposed operational workarounds.                                       | Explicit option rejection, TLS policy/certificate/fragmentation review and adversarial tests; preserve hostname/trust checks. Do not disable verification to gain compatibility. | Assurance R4 first; new protocol/server work later, XL; high.      |
| Auth/signing/key management: `api.crypto.*`                                                                       | OS randomness, selected hashes/HMAC/HKDF exist; no public cipher/key/sign/verify/PBKDF2/scrypt or Web Crypto subtle. Private TLS crypto is not a public security contract.                                                                           | Delegate authentication/signing to a maintained service/tool with explicit trust boundary; FFI only after ABI/security review.                                        | Algorithm/key-format/error vectors, entropy failures, timing/secret handling and independent cryptographic review.                                                               | Architectural R8; L/XL; high.                                      |
| Subprocess orchestration/signals: `api.child-process.*`, `api.process.signals`                                    | spawn/exec/execFile sync/async on Windows/Linux x64; fork/IPC unavailable, six-target adapters throw; Windows signals/execve differ. cross-spawn probe depends on external Node payload.                                                             | Pipes and external executable on supported x64; target-specific native process tools.                                                                                 | Port adapters and validate argv quoting, env/cwd, deadlock/maxBuffer, cancellation, wait/reaping and signal semantics.                                                           | Near-term R5, existing #328; L; high.                              |
| Parallel CPU jobs: `api.workers`, `api.messaging`, `language.shared-memory`                                       | Public Worker throws; channel exports lack implementation. SharedArrayBuffer/Atomics and compiler Test262 agents do not provide a worker pool.                                                                                                       | p-limit for overlapping promise work; separate processes with pipes on x64; Node workers for actual CPU parallelism.                                                  | Worker startup/static module graph, structured clone/transfers, per-thread roots/GC, exceptions, termination and message ownership.                                              | Architectural R7; XL; high.                                        |
| Locale/time-sensitive processing: `runtime.date`, `api.intl.*`                                                    | Date local fields use UTC; Intl formatting is en/en-US with UTC/fixed offsets, no general IANA zones; Segmenter graphemes only.                                                                                                                      | Store UTC/ISO timestamps; format outside Nona for locale-sensitive output.                                                                                            | Explicit locale/tz data version and distribution budget; DST/calendar/options vectors and unsupported-locale policy.                                                             | Later R8; L; high.                                                 |
| WASM/embedding/plugins: `api.wasm-wasi`, `dx.plugins-embedding`, `api.ffi`                                        | No WebAssembly/WASI or general embedder/plugin ABI; outbound static FFI works within its signature/target subset. No callbacks/dynamic dlopen; ARM64 variadic calls unsupported.                                                                     | Prebuild JS/static modules; native executable boundary; reviewed fixed FFI declarations.                                                                              | Decide sandbox/runtime model, ownership/GC/callback ABI and public version contract before implementation.                                                                       | Architectural R8; XL; high.                                        |
| Browser DOM and Node addons: `api.dom`, `api.addons`, `language.runtime-eval`                                     | DOM tree/rendering, .node/N-API and arbitrary runtime source are intentional exclusions.                                                                                                                                                             | Browser for UI; pre-generate code or use another runtime; FFI is not N-API compatibility.                                                                             | Reopen only with a concrete workload and explicit architecture decision.                                                                                                         | Excluded R10; not release defects.                                 |

This prioritization does not demand universal Node parity. Honest unsupported
errors, useful diagnostics and a reliable narrow contract often unblock users
sooner than adding export names. Each R entry below is a bounded decision/work
scope; larger rows must be split before implementation.

## Correctness and assurance

### What the current tests establish

The [Test262 accounting above](#test262-denominators-and-runner-limitations)
supersedes any attempt to combine old README totals into current conformance.
E3 retains 8 local selected checks (6 runtime, 2 compiler-only) and 3,187 CI
runtime passes in nine selected scopes, with 1,044 pre-selection exclusions.
The runner's broad parse-negative acceptance, single default variant, feature
filter age and bounded realm/agent model are material assurance limits.
Neither skipped nor unselected tests passed. No overall pass percentage is
computed here, and dates/targets stay attached to results.

Regression tests use [runOnHost](../tests/helpers/host.ts) and the
[Node oracle](../tests/helpers/oracle.ts), with many normal/GC-stress pairs.
Tests of JS module sources under Node exercise algorithms but bypass native
codegen, rooting and OS adapters; native tests cover those boundaries only on
their executing host. The [program corpus](program-corpus.md) combines language
features and preserves snapshots/oracle outputs. E4's 1,011 passing tests per
Windows/Linux job are valuable regressions, not 1,011 independent applications.
An oracle shares possible spec mistakes and output equality can miss latent
memory corruption, leaks or timing/liveness defects.

There is bounded generated-input coverage: seeded binary64 cases in
[numeric.test.ts](../tests/numeric.test.ts), power/math cases, seeded path
comparisons in [path-source.test.ts](../tests/path-source.test.ts), and malformed
compressed-input loops in [zlib.test.ts](../tests/zlib.test.ts). It would be
incorrect to say "no fuzzing." Inspection of scripts/tests/workflows did not
establish a sustained coverage-guided campaign, coverage budget, automatic
minimization or a native parser/GC/network sanitizer pipeline. These remain
unknown/unestablished, not proof that no external work exists. Native emitted
machine code also needs a detection strategy beyond sanitizing the TS host.

| Boundary               | Evidence and remaining question                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory/object layout   | Precise roots, layout assertions, stress poisoning, weak-map tests and E2 retention sample exist. Are callbacks, exceptions, resizes/detachment, coroutine suspension and FFI paths rooted under every native target? Not established. Arenas can retain memory without a live-object leak; weak-memory cap test was not run here.                                     |
| Numbers/Unicode/RegExp | Seeded numeric/oracle tests, generated Unicode tables, v-flag tests and RegExp regressions exist. x87/software math parity, signed zero/NaN, malformed UTF-8/lone surrogates, normalization versions and adversarial RegExp growth still need scoped coverage. RegExp VM timeouts outside the process are not an internal execution budget.                            |
| Concurrency/scheduling | Promise queues, context propagation and stream cancellation have selected evidence; shared memory has Test262 CI scopes. Public workers remain absent; private agents and Atomics do not establish race freedom or application worker semantics. Synchronous fs/stdio and long callbacks delay unrelated work.                                                         |
| FFI/ABI/exceptions     | Static signatures, ABI bridges, lastError and exception-register tests exist. Native code can overrun buffers or retain temporary strings; integer/pointer results use Number, with precision limits. No general callback lifetime contract. OS unwinding and JavaScript unwinding must be tested separately.                                                          |
| Network/parser/TLS     | HTTP body/header/parser limits and TLS record/handshake limits exist; TLS uses OS entropy/trust stores and E2 verifies CA/hostname failures. Slow clients, fragmentation, truncation, cancellation, pool isolation, parser disagreement and secret timing need adversarial review. No claim of a discovered exploitable vulnerability follows from this source review. |

TLS is implemented in [tls.js](../src/lib/modules/tls.js),
[x509.js](../src/lib/modules/x509.js) and private crypto, not an external audited
TLS library. Chain/signature/time/hostname verification is present: "no
certificate verification" would be false. Linux CA bundles and Windows ROOT
stores differ; CRL/OCSP/AIA/certificate policy coverage is absent, TLS1.2/client
authentication/session resumption are missing, and the crypto is not generally
constant-time or independently audited. The three E2 certificate cases cannot
certify network security, and security maturity must not be scored by export count.

### Precisely what Lean proves

E5 was read together with [copies.ts](../src/ir/copies.ts). Lean **4.19.0** models
`State V = Slot -> V`, pure expression trees and finite straight-line instruction
lists. Each instruction reads the old state then writes one slot; observations
are equality on a supplied live-slot list. Values and unary/binary functions
are parameters, so this does not assume JavaScript arithmetic equals integer
arithmetic. `substitute_correct` requires equal source slots;
`dead_write_correct` requires the destination unobserved; `coalesce_correct`
requires the temporary unobserved; `run_congr` supplies backward liveness;
`optimizer_correct` proves the modeled dead-move optimizer preserves observations
for **all programs and inputs in that fragment**. Examples demonstrate bad
alias/liveness rewrites and distinct signed-zero tags.

`Audit.lean` inspects transitive theorem dependencies, permitting only standard
`propext`, `Classical.choice`, `Quot.sound`, rejecting project axioms/sorryAx;
warnings are errors and examples use kernel `decide`. The trusted boundary
includes Lean's kernel/toolchain and the chosen mathematical model. There is
no extraction into TS, production refinement proof or per-executable translation
validation. CFGs/loops, heap/coercion effects, exceptions, mapped arguments,
allocation/GC, numeric instructions, ABI, loaders and machine code are excluded.
Production uses CFG liveness and up to four DCE rounds; the model recursively
analyzes one straight-line program. The correspondence is a design argument
supported by regression tests, not a theorem. Open [#284](https://github.com/40oleg/nona/issues/284)
and [#286](https://github.com/40oleg/nona/pull/286) do not expand this baseline's
guarantees. Lake was not available/run locally in step 3; workflow configuration
alone is not a proof-build result for this revision.

### CI, maintenance and supply chain

The actual [check](../.github/workflows/check.yml),
[corpus](../.github/workflows/program-corpus.yml),
[platform](../.github/workflows/native-platforms.yml),
[self-hosting](../.github/workflows/self-hosting.yml),
[proof](../.github/workflows/formal-verification.yml) and
[pages](../.github/workflows/pages.yml) predicates matter. PR Test262 jobs are
path/label gated; `full-ci` opts into platforms/bootstrap, `gc-stress` expands
stress. Main runs broader stress but platform bursts/cancellation can leave a
particular SHA without full execution. E4 has an audited cleanup `EPERM` failure
and cancelled platforms, plus earlier ARM64 oracle failures: none is silently
counted as green. #368/#369 proposals are not baseline behavior. These checks
should guard claims at the release SHA, not just display a workflow badge.

Shared code generation avoids eight duplicate compilers, but x64-shaped
register conventions, target thunks, syscall layouts and JS provider adapters
remain hotspots. Large JS preludes rely on private intrinsics and the two-global
invariant. [Architecture layout tests](../tests/architecture-doc.test.ts),
[module boundaries](../tests/module-boundaries.test.ts) and source-size budgets
help maintenance; they do not prove semantic consistency between adapters.
Partial/no-op facades spread detection costs into downstream applications.

Root `package.json` has development dependencies, no npm runtime dependencies;
the compiler/runtime is MIT. That is not a complete supply-chain assurance:
TypeScript 7.0.2, Prettier 3.9.10, Node, the site dependency tree, fixture packages,
Unicode-generated data and Actions all affect build/review inputs. Locks record
integrities; fixture installation disables scripts and pins primary package
metadata. Unicode RegExp data headers name the Unicode license.
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) also records fdlibm-derived
range-reduction constants and V8-derived nondecimal-formatting strategy, with
notice-retention terms. The [native packager](../scripts/package-native-cli.mjs)
copies the executable and LICENSE and writes VERSION/README.txt, but does not
copy THIRD_PARTY_NOTICES.md; the release archive script copies that package
directory. This is a concrete source-observed notice-delivery omission to
resolve before a release, not a completed compliance review. Published archives
were not downloaded to inspect their actual contents. Other copied/generated
notices and Unicode data still need a complete distribution inventory.

The [release workflow](../.github/workflows/release.yml) gates publishing on
bootstrap, checks tag/package versions and produces hashes. It uses major-tag
Actions such as checkout/setup-node/download-artifact; the Lean action is
SHA-pinned. No SBOM, artifact attestation or distribution-signing step was found
in that workflow, and no SECURITY.md was found in the checkout. Absence of an
observed public policy is not evidence of a known vulnerability. Hashes detect
changed downloads relative to the hash source, not a compromised publisher;
archive timestamps/toolchain inputs also prevent inferring reproducibility from
stage-2 equality. Scope a provenance/notice/release-hardening review separately.

## Versioned comparisons

Official sources below were retrieved **2026-10-18**. Release/tag links pin the
comparison versions; unversioned manuals are dated observations and can change.
Only Node 26.9.0 was executed as the E2 oracle. No Deno/Bun/QuickJS/QuickJS-NG/
Static Hermes install, package trial, security test or benchmark was performed.
API breadth comparisons are documented contracts, not a common conformance run.

### Execution and packaging models first

| Baseline and reason selected                                                                                                                                                                                     | Execution model                                                                                                                                                                                                                                                 | Standalone packaging and dependencies                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nona audited `453418c1`, released v0.18.0                                                                                                                                                                        | Native AOT for program and JS preludes, own runtime/GC; RegExp has an internal VM.                                                                                                                                                                              | Direct PE/ELF/Mach-O writers. No separate JS engine or C build toolchain; OS imports, macOS libSystem and explicit FFI dependencies as described above.                                                                                                                                                           |
| [Node 26.9.0](https://nodejs.org/en/download/archive/v26.9.0), V8 `14.6.202.34-node.32` in E2: npm/host API reference                                                                                            | V8 runtime with interpretation/JIT tiers; ordinary deployment needs Node.                                                                                                                                                                                       | [SEA in this exact version](https://nodejs.org/download/release/v26.9.0/docs/api/single-executable-applications.html) embeds code/assets in Node; `node --build-sea` is built in. ESM/CJS and opt-in VFS exist; it is not native AOT of application JS.                                                           |
| [Deno 2.9.7](https://github.com/denoland/deno/releases/tag/v2.9.7), published 2026-09-17: Web APIs, permissions and integrated tooling                                                                           | V8 by default, plus Deno/Node compatibility services.                                                                                                                                                                                                           | [`deno compile`](https://docs.deno.com/runtime/reference/cli/compile/) embeds the program in a stripped `denort`, downloading the version/target runtime initially. No Deno installation needed at destination. Experimental QuickJS engine choice is documented separately; it is not the default or native AOT. |
| [Bun 1.4.3](https://bun.com/blog/bun-v1.4.3), 2026-10-10: integrated package/build/test runtime                                                                                                                  | [JavaScriptCore runtime](https://bun.com/docs/runtime), with JIT and Bun/Node/Web host services.                                                                                                                                                                | [`bun build --compile`](https://bun.com/docs/bundler/executables) bundles program/assets with Bun. Optional bytecode can reduce parse work; it does not remove the engine or make application execution native AOT.                                                                                               |
| [QuickJS 2026-06-04](https://bellard.org/quickjs/): small embeddable engine, useful footprint/design comparison                                                                                                  | Bytecode interpreter with reference counting and cycle collection; no optimizing JIT in this model.                                                                                                                                                             | [`qjsc`](https://bellard.org/quickjs/quickjs.html#Executable-generation) emits C containing bytecode and engine initialization, then uses a C compiler/linker. Executable packaging still interprets JS bytecode; dependencies depend on the selected static/dynamic build.                                       |
| [QuickJS-NG 0.17.0](https://github.com/quickjs-ng/quickjs/releases/tag/v0.17.0), 2026-09-18: separate maintained fork with broader platform work                                                                 | Embeddable bytecode interpreter, not an npm server runtime.                                                                                                                                                                                                     | [`qjs --compile`](https://quickjs-ng.github.io/quickjs/cli/) appends code to a base executable; it needs a prebundled single file for other JS dependencies. `qjsc` separately generates bytecode/C scaffolding. Neither is native compilation of JS operations.                                                  |
| Static Hermes `static_h` [17b37301da5da4a2cd55d78f9697c46c0fd96123](https://github.com/facebook/hermes/tree/17b37301da5da4a2cd55d78f9697c46c0fd96123), 2026-10-15 commit: additional native-code design baseline | [`shermes` native backend](https://github.com/facebook/hermes/blob/17b37301da5da4a2cd55d78f9697c46c0fd96123/tools/shermes/shermes.cpp) offers generated C, native optimization and typed/untyped compilation. Distinct from ordinary Hermes bytecode packaging. | Uses native compilation and a Hermes runtime rather than Nona's direct executable writers. Included to illustrate type information/native-toolchain tradeoffs, not as a verified replacement or measured winner.                                                                                                  |

Node SEA still carries OS/runtime dependencies and its embedded engine. Its
versioned manual requires matching Node versions for the preparation blob and
executable, disables snapshots/code cache for cross-platform generation, and
documents VFS/addon limitations (native addons need real files). Bundling a
runtime can solve "no preinstalled runtime" without giving Nona's compilation
model. Conversely Nona's AOT restrictions exclude runtime source loading that
runtime-based deployments can support. Neither model alone proves performance,
security, reproducibility or compatibility.

### Compatibility, platforms and operating the result

| Baseline      | Language, host APIs and modules                                                                                                                                                                                                                                        | Targets / deployment scope                                                                                                                                                                                                                       | Tooling and operational tradeoff                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nona          | ES2020 contract plus selected additions and AOT exceptions. E1/E2 show partial Node-style host coverage, nine package samples, no public workers/Fetch/WASM/N-API.                                                                                                     | Eight emitted targets; local Windows x64 probes, separately scoped CI. API portability is narrower than executable portability.                                                                                                                  | Small native deployment path, structured compile errors, counters/coverage; poor runtime stacks, no source debugger, no demonstrated hostile-code sandbox or release support policy.                                                                          |
| Node/V8       | The [versioned API reference](https://nodejs.org/download/release/v26.9.0/docs/api/) includes filesystem streams/watchers, DNS/UDP, HTTP2/TLS, crypto, workers/IPC and diagnostics. Native npm/CJS/ESM contract; addons and Web APIs still have their own constraints. | [26.9.0 binaries](https://nodejs.org/en/download/archive/v26.9.0) include Windows/Linux/macOS x64/ARM64 and additional architectures; SEA has its own supported-platform limits. Binary/OS/library requirements are not eliminated by packaging. | Inspector, profiling, source locations, test runner and established package tooling. Select an appropriate [supported release line](https://nodejs.org/en/about/previous-releases) for production; the oracle's current version is not an LTS recommendation. |
| Deno          | [Node/npm compatibility](https://docs.deno.com/runtime/fundamentals/node/) coexists with Web/Deno APIs, TS handling and CJS/ESM. Compatibility layer and permission/native-addon requirements must be tested per package.                                              | Compile manual lists Windows/Linux/macOS x64/ARM64, including Windows ARM starting 2.9.3; GNU Linux target runtime, not Nona's libc-free model.                                                                                                  | [Inspector/source-map debugging](https://docs.deno.com/runtime/fundamentals/debugging/), checker/LSP/test tools and permissions. Lifecycle change below is material to long-term deployment.                                                                  |
| Bun           | [Node compatibility table](https://bun.com/docs/runtime/nodejs-compat) documents broad but incomplete APIs; runtime-specific behavior remains (e.g. TLS renegotiation and V8-shaped APIs). JS/TS, package manager and bundler integrated.                              | Compile docs list Windows/Linux/macOS x64/ARM64 plus Linux glibc/musl choices. Runtime/base-artifact and CPU constraints still apply.                                                                                                            | Integrated test/build tooling; 1.4.3 adds `bun check`. JavaScriptCore debugging/profiling differs from V8. Test required native modules, streams and lifecycle behavior rather than assume complete Node parity.                                              |
| QuickJS       | Current [release page](https://bellard.org/quickjs/) advertises almost complete ES2025/Annex B; this is upstream's scoped claim, not E3's denominator. Small std/os and C embedding, not a Node host/npm contract.                                                     | C build/OS configuration controls dependencies. Official release offers Linux/Windows binaries and Cosmopolitan packages covering more OS/CPU pairs; these were not executed here.                                                               | C API, limits/interrupts and line tables suit embedding; host I/O, npm loader, inspector-style tools and production service integration are the embedder's work.                                                                                              |
| QuickJS-NG    | [Feature policy](https://quickjs-ng.github.io/quickjs/es_features/) targets current ECMAScript but excludes Intl for size; std/os/C API rather than Node parity. It must be assessed separately from upstream QuickJS.                                                 | [Platform policy](https://quickjs-ng.github.io/quickjs/supported_platforms/) includes Linux glibc/musl, macOS and Windows; BSD, Android/iOS explicitly have limited testing. A supported build is not a verified workload.                       | CLI memory/stack controls and debug dumps; runtime integration belongs to host. 0.17.0 release notes include reference-count/bounds fixes, evidence of ongoing maintenance, not proof of safety.                                                              |
| Static Hermes | [Pinned feature policy](https://github.com/facebook/hermes/blob/17b37301da5da4a2cd55d78f9697c46c0fd96123/doc/Features.md) reflects Hermes/React Native priorities and explicit semantics tradeoffs. Do not infer Node/npm server compatibility.                        | Native target/toolchain/runtime integration must be established for a chosen build; no audited eight-target equivalence here.                                                                                                                    | Type/native optimization is relevant to Nona's future specialization decisions. This source-only comparator has no readiness or throughput score in this audit.                                                                                               |

A separate security/operations dimension matters more than counting methods:

- Node documents an [opt-in permission model](https://nodejs.org/download/release/v26.9.0/docs/api/permissions.html)
  with an explicit non-malicious-code threat boundary. Its existence is not a
  sandbox guarantee for arbitrary hostile JS.
- Deno [restricts privileged I/O by default](https://docs.deno.com/runtime/fundamentals/security/),
  with grants and escape hatches for native/subprocess capabilities. On
  **2026-10-09**, its team [announced](https://deno.com/blog/cloudflare) another
  year of monthly runtime bug/security updates followed by the end of their
  runtime development; Deploy has a different six-month horizon. Continued
  open-source maintenance is possible but not guaranteed by that announcement.
- Bun's [compatibility documentation](https://bun.com/docs/runtime/nodejs-compat)
  describes BoringSSL-backed TLS; Nona owns its TLS implementation. This is a
  difference in maintenance/security dependencies, not a numerical security
  rating or a claim that either is vulnerability-free.
- QuickJS warns that its version-specific bytecode must not be loaded from
  untrusted sources in its [C API documentation](https://bellard.org/quickjs/quickjs.html#Script-evaluation).
  Embedding memory/interrupt limits are useful controls, not complete process
  isolation. Nona's lack of runtime eval likewise does not sandbox native I/O
  or make parsers and FFI memory-safe.

For reproducibility, all runtime-containing executables need pinned runtime
versions, dependency graphs, target artifacts and signing/asset settings;
QuickJS/shermes C paths also need a pinned native toolchain. Nona avoids that
C-toolchain input but still needs compiler/source/cache/resource provenance.
No cross-machine bit-for-bit test was run for any comparator. Operationally,
standalone binaries must be rebuilt/redeployed to receive embedded engine or
library fixes; a small output file does not remove that maintenance duty.

Nona's current advantages are an integrated native pipeline, default libc-free
Linux/BSD deployment, explicit runtime-part selection and a demonstrated x64
bootstrap fixed point. Node/Deno/Bun offer richer host contracts and diagnostics;
QuickJS variants offer mature embedding surfaces and dynamic evaluation with a
different footprint/throughput balance. Actual startup/RSS/size/throughput
ranking is deferred to E6/#392. Intentional simplicity is useful when its
constraints match the application; unconditional Node parity is not the goal.

## Risk register

Severity rates impact **when the boundary is encountered**, not exploitability:
high blocks a workload or invalidates a release/security claim; medium imposes
significant adaptation/maintenance; low is a scoped inconvenience. Confidence
is high for reproduced/source-explicit facts, medium for a plausible exposure
whose incidence is unmeasured. "Risk" rows are not discovered vulnerabilities.

| ID                                  | Severity / confidence                                                           | Affected users / targets; evidence                                                                                                                                         | Mitigation and next action                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 Package execution failures       | High / high observed; root cause unknown                                        | fs-extra, Undici, workerpool users on win32-x64; E2 compile success followed by exact runtime errors. Other targets not inferred.                                          | Use only tested narrower APIs; R1 minimizes first failing operation and adds regression/diagnostic evidence. Do not attribute all failures to one missing API.                           |
| F2 API-shaped stubs/options         | High / high                                                                     | Workers, HTTP2, TLS servers, OS/perf/TTY consumers and HTTPS option users; E1, E2 Worker. Imports/typeof can succeed without service semantics.                            | Explicit feature checks against contract, unsupported errors instead of misleading values where feasible; R6.                                                                            |
| F3 Blocking/missing file lifecycle  | High / high boundary, impact input-dependent                                    | Large-file servers/watch tooling on all targets; E1 fs-common/promises, missing fd/FileHandle/streams/watchers.                                                            | Bounded whole-file tools; R3 descriptor/stream/async design and latency/abort acceptance.                                                                                                |
| F4 Network/TLS assurance            | High / high gaps, medium untested risk                                          | Internet-facing x64 services/clients; E1 HTTP unenforced timeout fields, custom TLS/X509/crypto; E2 validates only three certificate cases.                                | Narrow protocol/trust contract, mature proxy/client where required; R4 hardening and independent security review before stronger claims. No exploit is asserted.                         |
| F5 Target confidence mismatch       | High / high                                                                     | ARM64/macOS/BSD deployers, network/child users outside x64 Windows/Linux; E1 gates and E4 failed/cancelled/smoke-only jobs.                                                | Pin target contract and run native workload acceptance; R0/R5. Artifact generation and bootstrap smoke are insufficient.                                                                 |
| F6 Misstated conformance/readiness  | High / high                                                                     | All prospective adopters; E3 negative-test/variant/filter limits and mixed-age README/status numbers; E4 non-green baseline.                                               | Publish denominators/age/exclusions; R0 audit review and R2 runner accounting. Do not require every excluded test to pass to acknowledge the limitation.                                 |
| F7 Native memory/ABI invariants     | High / medium risk                                                              | Allocating callbacks, exception/coroutine/FFI/buffer-resize paths on all targets; E1 roots/GC/layout/ABI, E2 tiny stress sample.                                           | Stress/regression/cap tests, lifetime documentation and target boundary review; R7/R9. No memory-safety proof or new reproducible corruption claimed.                                    |
| F8 Dynamic linking selection        | Medium / high                                                                   | Libraries reaching optional parts through computed/common names; E1 link.ts/Iterator triggers.                                                                             | `--print-link`, explicit `--link`/`--full-runtime`; R6 detection/docs and a computed-name contract test.                                                                                 |
| F9 Runtime observability            | High / high                                                                     | Package and production failure diagnosis on all targets; E2 generic errors, E1 anonymous CallSites/no debugger.                                                            | Minimize under Node oracle and add contextual logging; R1 source-aware stacks with import/async paths.                                                                                   |
| F10 Numeric/text/locale edges       | Medium / high scope, medium defect risk                                         | Locale/time-zone/IDNA/text-stream users, cross-arch numeric users; E1 UTC/en restrictions, codec/IDNA subsets, x87/software math.                                          | UTC-only inputs and explicit supported encodings; R6/R8 vectors/data contracts. No blanket numerical inaccuracy claim.                                                                   |
| F11 Performance and retained memory | Medium / medium current impact                                                  | Allocation/call/RegExp/long-lived workloads; E6 stale measurements, E1 generic paths and arena/coroutine storage.                                                          | Measure real workload and retained vs peak memory through #392; R9 profiling-led scope, no fabricated current ratio.                                                                     |
| F12 Release provenance/notices      | High for notice omission / high source confidence; remaining provenance unknown | Binary distributors and dependency-sensitive users; source packager omits THIRD_PARTY_NOTICES.md; locks and release hashes exist but no observed SBOM/signing/attestation. | Release gate: ship recorded notices and test every archive; R0/R9. Pin build inputs and scope provenance separately. Hashes and self-hosting do not authenticate the whole supply chain. |
| F13 Public concurrency gap          | High / high                                                                     | CPU worker/IPC workloads; E2 Worker gap and workerpool error, E1 channel/fork stubs.                                                                                       | Promise queues only for async overlap; separate processes where supported; R7 thread/clone/root design before APIs.                                                                      |

## Prioritized roadmap

These are **ten follow-up scopes plus the audit release gate**, not issues
created or claimed by this report. Open issue titles/state were rechecked on
2026-10-18; #392 remains separately claimed. Existing links are reused, not
duplicated. Size has the relative meaning defined above. Acceptance is a
concrete outcome to require of the future work, not a test claimed to pass now.

| Rank / scope                                              | User outcome and evidence                                                                                             | Dependencies; size / uncertainty                                                                        | Acceptance and existing work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R0 Release gate: reviewed, truthful audit                 | Users can distinguish released/current/unknown behavior; F5/F6, E1–E8.                                                | Steps 4–6 and exact final report revision; M / medium. No runtime feature prerequisite.                 | Independent reviewer reads evidence and reproduces samples; resolve material findings, re-review, add review record/verdict. Record release-SHA CI failures and resolve or explicitly downgrade affected claims. [#394](https://github.com/40oleg/nona/issues/394); namespace coordination [#391](https://github.com/40oleg/nona/issues/391)/[#393](https://github.com/40oleg/nona/pull/393).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R1 Near-term: package triage and runtime locations        | fs-extra/Undici/workerpool failures become actionable; F1/F9, E2.                                                     | Preserve exact package locks; source-to-function/frame mapping; M for reductions, L for stacks / high.  | Each package gets a minimal first-failure reproduction, correct root-cause label and linked follow-up. Add file/function/line for nested/imported runtime errors, with a GC-stress regression. Proposed new scope; no matching open issue found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R2 Near-term: conformance accounting                      | A reported pass means the expected phase/error/variant ran; F6, E3.                                                   | Test262 runner/report schema and pinned fixture; M / medium.                                            | Serialize selection/full-runtime/variants; assert expected negative error type; separate excluded/skipped/runtime/compiler-only; a bounded fixture proves accounting. Full suites remain CI. Proposed scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R3 Near-term: bounded file pipeline                       | CLI/server can copy a large file with bounded buffers and reliable cancellation; F3, E1/E2.                           | Descriptor lifecycle, streams and target adapters; L / high.                                            | Read/write partial chunks, explicit close/abort/error behavior, backpressure and bounded resident growth on Windows/Linux x64; document remaining targets. Split watcher and genuinely asynchronous I/O proposals after this contract. Proposed scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R4 Near-term: trustworthy x64 networking contract         | Clients/services have enforced limits and explicit supported security options; F4, E1/E2.                             | R1 Undici reduction; HTTP/TLS parsing/lifecycle and Web body model; L / high.                           | First enforce/reject timeout/TLS options and test slow headers, truncated/fragmented bodies, abort/pool isolation, malformed chains/hostname failures. Independent crypto review before security claims. Separately scope DNS lookup and minimal Fetch streaming/abort coverage; no umbrella HTTP2/TLS-server promise. Proposed scopes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R5 Near-term: target-specific API portability             | Users know which artifacts execute required fs/process/network work; F5, E4.                                          | Native runners and OS adapter contracts; L / high.                                                      | Port child-process services with quoting/pipe/wait/signal tests, rerun affected ARM64 suites, retain explicit network exclusions until ported. Reuse [#328](https://github.com/40oleg/nona/issues/328); network porting is a separate proposed scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R6 Near-term: honest facades and small semantic gaps      | CLIs/telemetry/cancellation/computed-name consumers get real behavior or explicit unsupported results; F2/F8/F10, E1. | Registry/provider consistency and targeted Node oracle vectors; M per family / medium.                  | Pick one family per issue: OS/TTY/perf, timers abort/ref, codec split-input, or linker discovery. Assert behavior/options and target scope, not export presence; keep inventory/entry docs synchronized. #391 owns namespace docs, not all these implementations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R7 Architectural: worker/IPC ownership model              | CPU jobs can communicate and terminate without leaked native state; F7/F13, E1/E2.                                    | Static worker entry graph, structured clone/transfers, per-thread roots/GC and cancellation; XL / high. | Design review first; then bounded worker message/result/error/termination tests, transfer-detachment and stress/race evidence on each promised target. Test262 agents remain separate. Proposed scope; do not claim this for v0.20.0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R8 Architectural: choose one missing integration contract | A justified workload gains key/signing APIs, locale/tz data, or WASM/embedding support; API table, E1.                | Each requires a separate design/security/size budget; L–XL / high.                                      | Rank by actual adopter demand; choose one independently scoped proposal with explicit formats/options, vectors, licenses and unsupported cases. Do not combine crypto, Intl and WASM into a "parity" issue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R9 Measurement/assurance track                            | Optimize measured costs and make regressions/releases inspectable; F7/F11/F12, E4/E6.                                 | #392 results for optimization; separate fuzz/provenance designs; M–L each / high.                       | Reuse [#392](https://github.com/40oleg/nona/issues/392); profile before [#44](https://github.com/40oleg/nona/issues/44), [#47](https://github.com/40oleg/nona/issues/47), [#48](https://github.com/40oleg/nona/issues/48), [#155](https://github.com/40oleg/nona/issues/155), [#235](https://github.com/40oleg/nona/issues/235), [#236](https://github.com/40oleg/nona/issues/236), [#239](https://github.com/40oleg/nona/issues/239), [#240](https://github.com/40oleg/nona/issues/240), [#387](https://github.com/40oleg/nona/issues/387), [#388](https://github.com/40oleg/nona/issues/388), [#389](https://github.com/40oleg/nona/issues/389). Separate proposed campaign must retain seeds/minimized failures/budgets; release proposal must compare independent archives and document notices/attestation. |
| R10 Intentional exclusions                                | Users avoid investing in an incompatible architecture; E1.                                                            | Explicit project scope; S for guidance / low.                                                           | Keep DOM rendering, arbitrary runtime source and Node native-addon parity excluded with migration guidance. [#11](https://github.com/40oleg/nona/issues/11) records eval policy. Reopen only on an explicit design decision; do not count excluded facilities as compiler bugs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

R8/R9 are decision tracks with concrete candidate scopes, not permission to
open one giant implementation issue. R0 is the only audit-completion gate;
R4's stronger security/service claims require its separate acceptance before
being advertised. Separately, F12's notice-delivery omission should block the
next binary release until a narrowly scoped packaging follow-up copies the
recorded notices and asserts their presence in every target archive (S/low
implementation uncertainty; full notice inventory remains M/medium). This is
a proposed scope, not an archive repair performed in #394. No release version
is bumped by this report.

## Practical readiness and refresh

| Intended application                                                            | Judgment at the audited SHA                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded CLI, JSON/config/file transformation                                    | Credible experimental choice when the exact package/input contract passes. Windows x64 has local evidence; Linux x64 has substantial separate CI evidence and still needs the workload reproduced.                                |
| Small HTTP service or compression pipeline                                      | The Express/fflate samples work on Windows x64; they do not validate large payloads, persistent service reliability or hostile input. Respect x64-only network services and enforce deployment limits externally where necessary. |
| General npm service, secure network endpoint, large streaming filesystem tool   | Likely to meet API, diagnostics or assurance blockers. Use the contract ledger and failing probes before committing to migration; a successful build is insufficient.                                                             |
| Worker pool, WASM/native-addon-heavy package, locale/zone-sensitive application | Public workers/WASM/addon gaps or Date/Intl restrictions are material blockers; choose an explicit workaround or another runtime.                                                                                                 |
| ARM64, macOS or BSD application                                                 | Native code/CLI bootstrap exists, with CI scope and failures recorded. Adopt only after running the exact workload on the target; network/child API availability differs sharply.                                                 |

Better runtime diagnostics and bounded I/O would materially reduce migration
cost; trustworthy network/target contracts would expand deployable workloads.
The strongest unknowns are the three package root causes, untested method/
option combinations, current native target regressions, long-lived memory and
latency behavior, adversarial TLS/network/FFI behavior, current performance,
cross-machine release reproducibility and independent review outcome.

To refresh this report after a release:

1. Pin compiler SHA, latest published tag and tool/OS versions; record open/merged
   PR states separately. Preserve old evidence files rather than overwriting
   their provenance. Recheck ownership before any follow-up implementation.
2. Diff providers, globals, target gates and compiler passes. Retain capability
   IDs, revise scopes/statuses and release relations, and authenticate all E1
   blobs. Reset verification claims when relevant implementation changes.
3. Rebuild explicitly, run pinned fixture oracles/builds/executables separately
   with bounded resources, retain exact errors and cleanup, and repeat material
   failures. Add target executions as separate observations, never infer them
   from cross-compilation or a workflow configuration.
4. Refresh selected Test262 denominator reports, actual CI outcomes and bootstrap
   scope. Do not merge historical counts, skips, exclusions or strict variants.
5. Recheck official comparator versions/docs/lifecycle and #392; use comparable
   measurements only. Re-rank workload impact and link existing follow-ups.
6. Run the focused validation/site checks below, update translated entry points,
   then obtain independent evidence review, corrections and re-review tied to
   the final report commit. Only then can #394's review/PR criteria be completed.

## Step 3 validation

Validation uses the same Windows x64 host and Node 26.9.0 as E2, npm 10.9.8,
TypeScript 7.0.2, Prettier 3.9.10, VitePress 1.6.4 and esbuild 0.21.5. Late
checks are on 2026-10-19 Moscow time, still 2026-10-18 UTC. The latest published
release was rechecked at 21:05 UTC as v0.18.0; #392 had no open result PR.
All heavy checks run sequentially. Go/libuv/V8 pools and test concurrency are
capped at two; Node heap is capped at 1,536 MiB and VitePress page concurrency
at two. These limits are build/test resource controls, not performance data.

| Command / check                                                                                                                                                    | Result and scope                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/build.mjs`                                                                                                                                           | Pass, fresh compiler build from unchanged compiler/runtime inputs.                                                                                                                                                                                                              |
| `node scripts/check-completeness-inventory.mjs --git`                                                                                                              | Pass: 140 capabilities, 42 entry points, eight targets; evidence blobs authenticated. No status promoted by a filename.                                                                                                                                                         |
| `node --test --test-concurrency=2 dist/tests/completeness-probes.test.js dist/tests/completeness-inventory.test.js dist/tests/suites.test.js`                      | 14 passed, zero failures/skips; includes probe cleanup/timeout/descendant handling, fixture locks and denominator validation.                                                                                                                                                   |
| `node --test --test-concurrency=2 --test-name-pattern='flags getter reads unicodeSets\|u and v together\|v behaves as u for dot' dist/tests/regexp-v-flag.test.js` | Four selected checks passed: generic getter, two invalid-flag checks and Unicode/surrogate/index behavior; native checks use the suite's GC stress. The rest of that suite was not selected. Supports removing the contradictory README negative, not full RegExp verification. |
| Site `npm ci --ignore-scripts --no-audit --no-fund`                                                                                                                | Pass using the lockfile and Node 26; 144 packages. No dependency/lock changes.                                                                                                                                                                                                  |
| Site sync, playground bundle, VitePress production build                                                                                                           | Pass with page concurrency two; 12 synced documents. `sync-docs.mjs` publishes this report through its reference wrapper; all nine locales link to the English evidence with localized labels.                                                                                  |
| Site `npm run check:links`                                                                                                                                         | Pass: repository-file links checked (690 before the final notice/validation additions) in generated HTML; production build also checks internal page routes. External HTTP URLs are source-researched, not exhaustively crawled by this script.                                 |
| Site `npm run check:samples`                                                                                                                                       | Pass: 22 Windows/Linux x64 sample builds. Artifact compilation only; no application execution.                                                                                                                                                                                  |
| Site `npm run check:playground`                                                                                                                                    | Initially failed ten module image comparisons on Windows; after the test-only canonical-path correction below, all 18 image comparisons and the syntax diagnostic check pass. Cross-target byte identity is not native execution.                                               |
| `npm run format`, `npm run format:check`, `git diff --check`                                                                                                       | Pass: repository formatting and whitespace checks. No compiler/runtime or lockfile changes.                                                                                                                                                                                     |

The initial playground failure used different logical source URLs: Node's
`modulePath('/app.mjs')` on this Windows drive is `/C:/app.mjs`, while the
browser path shim keeps `/app.mjs`. Both compilers succeeded. An isolated check
of `playground-async.mjs` and `path.mjs` found unequal images with the original
names and equal images when the browser received `/C:/app.mjs`. The checker now
uses the host compiler's canonical `modulePath` for the browser input and
retains exact byte comparison. The compiler, browser worker and runtime are
unchanged; this corrects test inputs rather than hiding a runtime failure.

Reproduce with an installed Node >=26 (the recorded run used the downloaded
`work/completeness-tools/node.exe` and explicit npm CLI, as in E2):

```powershell
$env:GOMAXPROCS = '2'
$env:UV_THREADPOOL_SIZE = '2'
$env:NODE_OPTIONS = '--v8-pool-size=2 --max-old-space-size=1536'
node scripts/build.mjs
node scripts/check-completeness-inventory.mjs --git
node --test --test-concurrency=2 dist/tests/completeness-probes.test.js dist/tests/completeness-inventory.test.js dist/tests/suites.test.js
node --test --test-concurrency=2 --test-name-pattern='flags getter reads unicodeSets|u and v together|v behaves as u for dot' dist/tests/regexp-v-flag.test.js
npm --prefix site ci --ignore-scripts --no-audit --no-fund
npm --prefix site run sync
npm --prefix site run build:playground
Push-Location site
node --input-type=module -e 'import { build } from "vitepress"; await build(".", { onAfterConfigResolve(c) { c.buildConcurrency = 2; } });'
Pop-Location
npm --prefix site run check:links
npm --prefix site run check:samples
npm --prefix site run check:playground
npm run format
npm run format:check
git diff --check
```

The VitePress API invocation runs the production-build stage of `site`'s
`npm run build`, overriding its default page concurrency of 64 without changing
repository defaults. The actual invocation used a temporary `work/` module
with that same `build` callback. No servers/background helpers remain.

The final user instruction prohibits a full suite on this shared machine, overriding the
earlier generic `npm run check` requirement. Full `npm run check`, `npm run
compare`, full Test262/corpus/platform/bootstrap and benchmarks are **not run**
locally for this documentation change. Lean is unavailable locally. These are
omissions, not passing results. Step 4/6 independent review has not run.

## Inventory schema v1

The JSON is UTF-8, uses `schemaVersion: 1`, and is validated by
[`scripts/check-completeness-inventory.mjs`](../scripts/check-completeness-inventory.mjs).
This section defines its schema; it is not an external JSON Schema dependency.
Additive fields may be introduced within v1; changed meanings or removed
required fields require a version bump and validator migration. IDs must remain
stable when a status changes. Split a row when platforms/subfeatures require
different status/evidence; do not silently repurpose an ID.

| Field                                                 | Required meaning                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit`                                               | Issue, step/state, date, full baseline/planning SHA, release/tag provenance, environment, ownership, excluded open PRs, post-release merges and execution policy                                                                                                                                                                         |
| `domains`                                             | The nine required domains; required subfamilies are independently listed in the validator                                                                                                                                                                                                                                                |
| `targets[]`                                           | Stable target ID, format, separate local build/run states, configured CI mode, baseline CI evidence state, emulation state, limitations and evidence references                                                                                                                                                                          |
| `entryPoints[]`                                       | Stable ID, canonical specifier, actual aliases, public/internal visibility, referenced capability IDs, evidence and availability note; aliases do not imply service support                                                                                                                                                              |
| `evidence`                                            | Map keyed by repository path; each value repeats `path`, records kind, full `commit`, exact GitHub blob URL, baseline `blob` and `releaseBlob` Git object IDs (null if absent at release), and execution state. Structural checks resolve local paths and recorded relationships; `--git` authenticates these records against both trees |
| `capabilities[].id`                                   | Unique lowercase dotted/hyphenated ID, e.g. `api.fs.async`                                                                                                                                                                                                                                                                               |
| `domain`, `family`, `scope`, `surfaces`, `visibility` | Defined coverage family, bounded semantic claim, actual global/module/compiler names and public/internal contract                                                                                                                                                                                                                        |
| `status`, `limitations`, `affectedTargets`            | Explicit status and nonempty boundary; targets are the scope being assessed, **not** a list of passing platforms                                                                                                                                                                                                                         |
| `evidence.sources/tests/documentation/links`          | Registry references plus external issue/PR URLs. Sources/docs required; empty tests require the explicit `evidenceNeeded` explanation. A reference can be a candidate test without being a passing test                                                                                                                                  |
| `release`                                             | Compared published tag plus `sources-unchanged-since-release`, `sources-changed-since-release`, or `includes-unreleased-sources`; computed against the inspected files, not inferred from package version                                                                                                                                |
| `execution.build/run`                                 | Each is `not-run`, `passed`, `failed`, or `not-applicable`; test-file presence never sets either to passed                                                                                                                                                                                                                               |
| `execution.results[]`                                 | Later observations: `command`, `environment`, `commit`, `target`, `stage` (`build`/`run`), `outcome` (`passed`/`failed`), `observed`, and retained `artifact` reference. Store exact expected outcomes in the probe/result artifact                                                                                                      |
| `evidenceNeeded`                                      | What remains to substantiate this row; required even for a narrow verified row to state its residual limits                                                                                                                                                                                                                              |

Status vocabulary:

- `implemented-unverified`: an implementation path is identified, but its full
  method/target scope has not been verified in this audit. Execution records may
  contain passing samples within that broader scope.
- `implemented-verified`: requires passing build/run records at the audited SHA
  for **every target within that row's scope**. Narrow/split the row when only
  a sample of targets is verified; record scope precisely.
- `partial`: some behavior exists but specific options, semantics, services or
  target behavior remain restricted. This does not imply the working portion
  was run; consult execution fields.
- `missing`: the public service is absent or implemented only as a throwing/no-op
  facade. Specify any importable surface and supporting negative evidence.
- `intentionally-unsupported`: a documented AOT/host scope decision, separated
  from a defect or unfinished implementation.
- `unknown`: available evidence cannot establish the requested conclusion
  (for example, real package readiness or whole-release reproducibility).

## Inventory validation and refresh (step 1)

The following records the initial inventory checks; step 2's additional checks
and 14-test result are recorded above.

Run from the repository root:

```powershell
node scripts/check-completeness-inventory.mjs
node scripts/check-completeness-inventory.mjs --git
node --experimental-strip-types --test --test-concurrency=2 tests/completeness-inventory.test.ts tests/suites.test.ts
```

Observed: JSON parses; 140 rows, 42 entry points and eight targets validate;
**eight tests pass, zero failures/skips**. The new test is registered exactly
once in `tests/suites.json`. These tests also reject duplicate IDs, missing
domain/target coverage, dangling or unpinned references, wrong release
provenance, private/public confusion and unsupported verification claims. A
separate assertion covers explicit module registrations, bare aliases and both
path flavors; a newly added provider requires an inventory update.
On an already-built Node 26 checkout the corresponding focused command is:

```powershell
node --test --test-concurrency=2 dist/tests/completeness-inventory.test.js dist/tests/suites.test.js
```

Only changed files are formatted with Prettier 3.9.10. No full `npm run check`,
site build, runtime suite or `npm run compare` is justified by this inventory
change. Ordinary validation and the tests are offline and work in shallow CI
checkouts: they check local reference paths, full SHA URLs and recorded blob
relationships. The additional `--git` command was run locally to authenticate
all 445 reference records against the actual baseline and release trees. That
strict command requires both commit objects; a missing object is an explicit
failure, with no implicit fetch or fallback. Fetch those commits before a strict
refresh check in a shallow checkout. Recorded blob consistency alone does not
authenticate the history.

Formatting commands used before the step commit:

```powershell
$auditFiles = @(git diff --name-only) + @('docs/completeness-audit.md', 'docs/completeness-matrix.json', 'scripts/check-completeness-inventory.mjs', 'tests/completeness-inventory.test.ts')
npm exec --yes --package prettier@3.9.10 -- prettier --write @auditFiles
npm exec --yes --package prettier@3.9.10 -- prettier --check @auditFiles
git diff --check
```

Both formatting and whitespace checks pass. A bounded Markdown-target scan of
the report, docs index, READMEs, changelog and nine module entry pages also
resolved 187 local/repository links. External URLs and built site routes were
not crawled; no site build or sample compilation was run.

To refresh, pin a new baseline and published release, inspect changed providers
and target gates, retain stable capability IDs, update commit-qualified
references and release relations, then reproduce bounded probes. Preserve old
results as dated artifacts and reset unsupported execution claims. Rerun the
structural validator, reconcile docs/aliases, recheck #392 and linked work, and
request the issue's independent review cycle before declaring readiness or
closing #394.
