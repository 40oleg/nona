# Completeness audit for v0.20.0 — inventory and practical evidence

**Report date: 2026-10-18. Status: steps 1–2 of 6, incomplete and not independently reviewed.**
This is the evidence inventory for [#394](https://github.com/40oleg/nona/issues/394),
covering the Nona JavaScript compiler/runtime. The target milestone is v0.20.0;
it does not promise that all identified gaps will be fixed in that release.

The inspected source supports a substantially broader implementation than some
older documentation describes. It also contains importable compatibility stubs,
restricted options, private services, and platform-specific implementations.
Neither module availability nor a test filename establishes that an application
works. Step 1 inspected source; step 2 adds the bounded Windows x64
[practical evidence below](#step-2-practical-evidence). Broader readiness
conclusions, alternative-runtime comparisons, a ranked roadmap and independent
review still belong to steps 3–6.

The [machine-readable inventory](completeness-matrix.json) is the detailed
capability ledger. It contains 140 rows across nine domains, 42 module entry
points (36 public, six private), all eight targets, and commit-qualified source,
documentation and test references. Its statuses are deliberately conservative:
58 implemented but unverified, 58 partial, 16 missing, three intentionally
unsupported, five unknown, and **zero implemented and verified across their full row scope**.
These are scoped inventory categories, not a completeness percentage.
Passing samples are recorded in execution fields; they do not verify every
method or target represented by a broad inventory row.

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

## Performance coordination and step 1 handoff

[#392](https://github.com/40oleg/nona/issues/392) was open and `blocked`, with no
comments/closing PRs and no linked performance PR in the inspected timeline.
The cross-reference from #394 is not a completed benchmark report. This step
did not claim #392, contact another agent, run benchmarks or replace its work.
`PERFORMANCE.md` labels its top section v0.13.0 and explicitly reuses a
2026-10-14 v0.12.0 measurement. These figures are not current v0.18.0 or
audited-SHA measurements. Step 3 must recheck #392 and reuse its dated results,
or retain that uncertainty; no fresh performance figures are inferred here.

The following is the original step 1 handoff. Step 2's completed sample and
remaining limits are recorded below; this list is not a claim that every
suggested probe has now run:

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
adversarial networking remain unverified. Steps 3–6 must retain these boundaries.

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
