# Completeness audit for v0.20.0 — inventory foundation

**Report date: 2026-10-18. Status: step 1 of 6, incomplete and not independently reviewed.**
This is the evidence inventory for [#394](https://github.com/40oleg/nona/issues/394),
covering the Nona JavaScript compiler/runtime. The target milestone is v0.20.0;
it does not promise that all identified gaps will be fixed in that release.

The inspected source supports a substantially broader implementation than some
older documentation describes. It also contains importable compatibility stubs,
restricted options, private services, and platform-specific implementations.
Neither module availability nor a test filename establishes that an application
works. **No Nona program was compiled or executed for this inventory step.**
Practical readiness conclusions, pinned package results, alternative-runtime
comparisons, a ranked roadmap and independent review belong to steps 2–6.

The [machine-readable inventory](completeness-matrix.json) is the detailed
capability ledger. It contains 140 rows across nine domains, 42 module entry
points (36 public, six private), all eight targets, and commit-qualified source,
documentation and test references. Its statuses are deliberately conservative:
58 implemented but unverified, 53 partial, 16 missing, three intentionally
unsupported, ten unknown, and **zero implemented and verified**.
These are scoped inventory categories, not a completeness percentage.

## Provenance and ownership

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

## Method and evidence limits

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
| Ecosystem            |    6 | Pending CLI/files/data/HTTP/streams/subprocess/concurrency package samples and alternative comparisons                            |

The JSON retains scope, limitations, affected targets, release relation, evidence
and next evidence needs for every row. Selected material boundaries follow;
these are findings from source, **not successful runtime probes**.

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

Every row below has **local build: not run; local execution: not run**.
CI entries describe configured coverage. Success at the audited SHA has not
been checked. The [platform document](native-platforms.md) cites a historical
eight-target success at `5391c47` and an Actions URL; that is not a current run.

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

## Documentation discrepancies to reconcile in later steps

These source-backed observations are recorded without rewriting unrelated
pages or claiming that a documentation correction verifies runtime behavior.
References resolve to the audited versions through the matrix registry.

| Document claim                                                                                                                                                 | Counterevidence / interpretation                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| README limitations still list RegExp `v` as unsupported, while the support section includes it                                                                 | RegExp VM and `regexp-v-flag.test.ts` exist; remove the contradictory negative after bounded confirmation                                           |
| README/README.ru publish v0.8.0 Test262 counts; `docs/status.md` has a different full-run table at `60b5763`; `language-support.md` warns of a v0.5.0 snapshot | Do not combine denominators or present any as audited-SHA conformance                                                                               |
| `docs/host-apis.md` says optional fs requires Windows/Linux; `docs/process.md` says fs unavailable on Darwin/BSD                                               | `fs-module.ts` dispatches all eight targets; current fs/native-platform docs agree                                                                  |
| Early `docs/fs.md` says `fs.promises` absent; later section says present                                                                                       | `fs-common.js` builds the object and `fs-promises.js` re-exports it                                                                                 |
| `docs/npm.md` says only Intl.Segmenter exists                                                                                                                  | `intl-source.ts` combines formatting/collation/plural services and grapheme segmentation; en/en-US and UTC limits remain                            |
| Buffer/network docs say require unavailable; networking text says no global URL                                                                                | CJS graph transformation, builtin registration and URL prelude now exist; runtime compatibility still needs probes                                  |
| Host API long-running section describes linear storage and a mapping per heap block                                                                            | Shapes/indexing and POSIX size-class arenas supersede parts of that description; consult current object model and shims                             |
| Platform docs imply platform workflow coverage on every PR; corpus docs imply all stress executions on every PR                                                | Actual workflow predicates require `full-ci` for platforms and gate stress/path-selected Test262 jobs; AGENTS.md describes these newer rules        |
| `node:module.builtinModules` is read as actual target support                                                                                                  | Its static list omits crypto/async_hooks and includes services unavailable on some targets; compiler registry and method behavior are authoritative |

## Performance coordination and pending evidence

[#392](https://github.com/40oleg/nona/issues/392) was open and `blocked`, with no
comments/closing PRs and no linked performance PR in the inspected timeline.
The cross-reference from #394 is not a completed benchmark report. This step
did not claim #392, contact another agent, run benchmarks or replace its work.
`PERFORMANCE.md` labels its top section v0.13.0 and explicitly reuses a
2026-10-14 v0.12.0 measurement. These figures are not current v0.18.0 or
audited-SHA measurements. Step 3 must recheck #392 and reuse its dated results,
or retain that uncertainty; no fresh performance figures are inferred here.

The next agent should prioritize evidence collection, not implementation of
missing APIs:

1. Use Node >=26 for compiler builds and record the exact host, tool versions,
   compiler SHA, dependency pins and commands. Preserve this inventory baseline
   if `main` moves; any baseline change must be explicit.
2. Add bounded probes for worker/HTTP2 stubs, child-process target selection,
   alias resolution, fs promises/watchers, timer abort/ref options, text codec
   streaming, OS/perf facades, compiler errors/stacks and runtime link triggers.
   Record import/compile, artifact creation and execution independently.
3. Pin real CLI/filesystem, JSON/data, HTTP server/client, stream/compression,
   subprocess and concurrency packages from primary repositories/registries.
   `docs/npm.md` hand-tested names and the program corpus are candidates, not
   reproduced package results. Capture locks, exact failures and workarounds;
   keep failures in the sample and bound time/memory/parallelism.
4. Check a meaningful normal/GC-stress sample on available native targets.
   For unavailable targets, preserve not-run and inspect appropriately pinned
   CI artifacts/logs separately; do not promote an artifact-format check to
   native success. Verify network/subprocess limitations even if imports build.
5. Reconcile Test262 revision, feature exclusions, variants, skips, negative
   test classification and result age. The pin is
   `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`; `post-es2020` filtering is not
   a universal denominator. No suite was downloaded/run here.
6. Step 3 must add primary-source, versioned alternative comparisons, the
   evidence-backed severity/confidence/workload risk register and bounded
   roadmap. Existing open issues include #328 (child targets), #387–#389
   (string/RegExp/sort performance), #44/#47/#48 and #235/#236/#239/#240
   (runtime/compiler optimization); recheck scope and ownership before proposing
   duplicates. Missing API rows contain initial workload/dependency notes,
   not final priority/size estimates.
7. Steps 4 and 6 require separate strong-model review with reproduced samples,
   with corrections in step 5. No review verdict or review document is fabricated
   in this step. Tie that later verdict to the final report revision.

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

- `implemented-unverified`: an implementation path is identified; its bounded
  behavior has not been executed in this audit.
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

## Validation and refresh

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
